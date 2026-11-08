/**
 * Production-Ready TypeScript Express Server
 * Toyota Finance API with WebSockets, validation, logging, and metrics
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import OpenAI from 'openai';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

// Services
import { calculateAllScenarios, calculatePurchase, calculateLease, calculateSubscription } from './services/financing.js';
import { getVehicleImage, prefetchImages } from './services/imageService.js';
import { parseQuery, parseComparison, extractColor, extractPriceRange } from './services/nlu.js';
import { registerNextMove } from './nextmove/routes.js';

// Types
import type {
  Vehicle,
  VehiclesQueryParams,
  VehiclesResponse,
  CompareRequest,
  ComparisonResult,
  ChatRequest,
  ChatResponse,
  FinancingParams,
  PaymentCalculation,
  HealthResponse,
  ApiError,
  RealtimeUpdate,
} from '../shared/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, 'key.env') });

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : true,
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3001;
const VERSION = '1.0.0';

// Initialize OpenAI
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// Load vehicle data
let vehiclesData: Vehicle[] = [];
try {
  vehiclesData = JSON.parse(
    readFileSync(join(__dirname, 'data/vehicles.json'), 'utf-8')
  );
  // Prefetch images on startup
  prefetchImages(vehiclesData).catch(console.error);
} catch (error) {
  console.error('Failed to load vehicles.json:', error);
}

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  (req as any).requestId = requestId;
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      requestId,
    });
  });
  
  next();
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  const error: ApiError = {
    error: err.message || 'Internal server error',
    code: 'INTERNAL_ERROR',
    timestamp: new Date().toISOString(),
    requestId: (req as any).requestId,
  };
  
  console.error('Error:', error);
  
  res.status(500).json(error);
});

// Input validation helper
function validateFinancingParams(params: any): FinancingParams {
  const {
    price,
    downPayment = 0,
    apr = 5.5,
    termMonths = 60,
    isLease = false,
    isSubscription = false,
    residualValue,
    tradeInValue = 0,
    taxRate = 0.08,
  } = params;
  
  if (typeof price !== 'number' || price <= 0) {
    throw new Error('Price must be a positive number');
  }
  if (typeof downPayment !== 'number' || downPayment < 0) {
    throw new Error('Down payment must be a non-negative number');
  }
  if (typeof apr !== 'number' || apr < 0 || apr > 100) {
    throw new Error('APR must be between 0 and 100');
  }
  if (typeof termMonths !== 'number' || termMonths < 12 || termMonths > 84) {
    throw new Error('Term must be between 12 and 84 months');
  }
  
  return {
    price,
    downPayment,
    apr,
    termMonths,
    isLease,
    isSubscription,
    residualValue,
    tradeInValue,
    taxRate,
  };
}

// Health check
app.get('/health', (req: Request, res: Response) => {
  const health: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: VERSION,
    services: {
      database: 'ok',
      openai: openai ? 'ok' : 'degraded',
      imageService: 'ok',
    },
  };
  
  res.json(health);
});

// Get vehicles with filtering and pagination
app.get('/api/vehicles', async (req: Request, res: Response) => {
  try {
    const params: VehiclesQueryParams = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
      search: req.query.search as string,
      type: req.query.type as string,
      make: req.query.make as string,
      drivetrain: req.query.drivetrain as string,
      fuelType: req.query.fuelType as string,
      minPrice: req.query.minPrice ? parseInt(req.query.minPrice as string) : undefined,
      maxPrice: req.query.maxPrice ? parseInt(req.query.maxPrice as string) : undefined,
      minMpg: req.query.minMpg ? parseInt(req.query.minMpg as string) : undefined,
      color: req.query.color as string,
    };
    
    let filtered = [...vehiclesData];
    
    // Text search (fuzzy)
    if (params.search) {
      const searchLower = params.search.toLowerCase();
      filtered = filtered.filter(v =>
        v.model.toLowerCase().includes(searchLower) ||
        v.make.toLowerCase().includes(searchLower) ||
        v.trim.toLowerCase().includes(searchLower) ||
        v.description.toLowerCase().includes(searchLower)
      );
    }
    
    // Filters
    if (params.type) filtered = filtered.filter(v => v.type === params.type);
    if (params.make) filtered = filtered.filter(v => v.make === params.make);
    if (params.drivetrain) filtered = filtered.filter(v => v.drivetrain === params.drivetrain);
    if (params.fuelType) filtered = filtered.filter(v => v.fuelType === params.fuelType);
    if (params.minPrice) filtered = filtered.filter(v => v.msrp >= params.minPrice!);
    if (params.maxPrice) filtered = filtered.filter(v => v.msrp <= params.maxPrice!);
    if (params.minMpg) filtered = filtered.filter(v => v.mpg.combined >= params.minMpg!);
    if (params.color) {
      filtered = filtered.filter(v =>
        v.colors.some(c =>
          c.name.toLowerCase().includes(params.color!.toLowerCase()) ||
          c.code.toLowerCase() === params.color!.toLowerCase()
        )
      );
    }
    
    // Pagination
    const pageNum = params.page!;
    const limitNum = params.limit!;
    const start = (pageNum - 1) * limitNum;
    const end = start + limitNum;
    const paginated = filtered.slice(start, end);
    
    const response: VehiclesResponse = {
      vehicles: paginated,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: filtered.length,
        pages: Math.ceil(filtered.length / limitNum),
      },
    };
    
    // Broadcast real-time update
    io.emit('vehicles_update', {
      type: 'vehicle_list',
      data: response,
      timestamp: new Date().toISOString(),
    } as RealtimeUpdate);
    
    res.json(response);
  } catch (error) {
    const apiError: ApiError = {
      error: error instanceof Error ? error.message : 'Error fetching vehicles',
      code: 'VEHICLES_ERROR',
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId,
    };
    res.status(500).json(apiError);
  }
});

// Get vehicle by ID
app.get('/api/vehicles/:id', async (req: Request, res: Response) => {
  try {
    const vehicle = vehiclesData.find(v => v.id === req.params.id);
    if (!vehicle) {
      const error: ApiError = {
        error: 'Vehicle not found',
        code: 'NOT_FOUND',
        timestamp: new Date().toISOString(),
        requestId: (req as any).requestId,
      };
      return res.status(404).json(error);
    }
    res.json(vehicle);
  } catch (error) {
    const apiError: ApiError = {
      error: error instanceof Error ? error.message : 'Error fetching vehicle',
      code: 'VEHICLE_ERROR',
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId,
    };
    res.status(500).json(apiError);
  }
});

// Compare vehicles
app.post('/api/compare', async (req: Request, res: Response) => {
  try {
    const body: CompareRequest = req.body;
    
    let v1: Vehicle | undefined;
    let v2: Vehicle | undefined;
    let color1: string | undefined;
    let color2: string | undefined;
    
    // Parse query if provided
    if (body.query) {
      const comparison = parseComparison(body.query);
      if (comparison.vehicle1) {
        v1 = comparison.vehicle1.vehicle;
        color1 = comparison.vehicle1.color?.name;
      }
      if (comparison.vehicle2) {
        v2 = comparison.vehicle2.vehicle;
        color2 = comparison.vehicle2.color?.name;
      }
    }
    
    // Use IDs if provided
    if (body.vehicle1 && !v1) {
      v1 = vehiclesData.find(v => v.id === body.vehicle1);
    }
    if (body.vehicle2 && !v2) {
      v2 = vehiclesData.find(v => v.id === body.vehicle2);
    }
    
    // Use color params
    if (body.color1) color1 = body.color1;
    if (body.color2) color2 = body.color2;
    
    if (!v1 || !v2) {
      const error: ApiError = {
        error: 'Could not find both vehicles to compare',
        code: 'COMPARE_ERROR',
        timestamp: new Date().toISOString(),
        requestId: (req as any).requestId,
        details: {
          suggestions: vehiclesData.slice(0, 5).map(v => ({
            id: v.id,
            name: `${v.make} ${v.model} ${v.trim}`,
          })),
        },
      };
      return res.status(400).json(error);
    }
    
    // Get images with color mapping
    const [img1, img2] = await Promise.all([
      getVehicleImage(v1, color1),
      getVehicleImage(v2, color2),
    ]);
    
    // Calculate financing
    const financing1 = calculateAllScenarios({
      price: v1.msrp,
      downPayment: 2000,
      apr: 5.5,
      termMonths: 60,
      isLease: false,
      isSubscription: false,
      tradeInValue: 0,
      taxRate: 0.08,
    });
    
    const financing2 = calculateAllScenarios({
      price: v2.msrp,
      downPayment: 2000,
      apr: 5.5,
      termMonths: 60,
      isLease: false,
      isSubscription: false,
      tradeInValue: 0,
      taxRate: 0.08,
    });
    
    const comparison: ComparisonResult = {
      vehicle1: {
        ...v1,
        selectedColor: img1.color,
        imageUrl: img1.url,
      },
      vehicle2: {
        ...v2,
        selectedColor: img2.color,
        imageUrl: img2.url,
      },
      differences: {
        price: v2.msrp - v1.msrp,
        mpg: v2.mpg.combined - v1.mpg.combined,
        horsepower: v2.engine.horsepower - v1.engine.horsepower,
      },
      similarities: [],
      financing: {
        vehicle1: financing1,
        vehicle2: financing2,
      },
    };
    
    // Find similarities
    if (v1.type === v2.type) comparison.similarities.push('Same vehicle type');
    if (v1.drivetrain === v2.drivetrain) comparison.similarities.push('Same drivetrain');
    if (v1.fuelType === v2.fuelType) comparison.similarities.push('Same fuel type');
    if (Math.abs(v1.msrp - v2.msrp) < 5000) comparison.similarities.push('Similar price range');
    
    res.json(comparison);
  } catch (error) {
    const apiError: ApiError = {
      error: error instanceof Error ? error.message : 'Error comparing vehicles',
      code: 'COMPARE_ERROR',
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId,
    };
    res.status(500).json(apiError);
  }
});

// Chat endpoint with NLU
app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const body: ChatRequest = req.body;
    const { message, conversationHistory = [], voiceInput = false } = body;
    
    if (!message || !message.trim()) {
      const error: ApiError = {
        error: 'Message is required',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
        requestId: (req as any).requestId,
      };
      return res.status(400).json(error);
    }
    
    // Parse query with NLU
    const nluResult = parseQuery(message);
    
    // Find matching vehicles
    let matchingVehicles: Vehicle[] = [];
    if (nluResult.entities.vehicles) {
      matchingVehicles = vehiclesData.filter(v => nluResult.entities.vehicles!.includes(v.id));
    } else {
      // Apply filters
      matchingVehicles = [...vehiclesData];
      const filters = nluResult.entities.filters;
      if (filters) {
        if (filters.type) matchingVehicles = matchingVehicles.filter(v => v.type === filters.type);
        if (filters.drivetrain) matchingVehicles = matchingVehicles.filter(v => v.drivetrain === filters.drivetrain);
        if (filters.fuelType) matchingVehicles = matchingVehicles.filter(v => v.fuelType === filters.fuelType);
        if (filters.make) matchingVehicles = matchingVehicles.filter(v => v.make === filters.make);
        if (filters.mpg) matchingVehicles = matchingVehicles.filter(v => v.mpg.combined >= filters.mpg!);
      }
      if (nluResult.entities.priceRange?.max) {
        matchingVehicles = matchingVehicles.filter(v => v.msrp <= nluResult.entities.priceRange!.max!);
      }
      if (nluResult.entities.priceRange?.min) {
        matchingVehicles = matchingVehicles.filter(v => v.msrp >= nluResult.entities.priceRange!.min!);
      }
    }
    
    const isComparison = nluResult.intent === 'compare';
    const isSearch = matchingVehicles.length > 0 && nluResult.intent === 'search';
    
    // Generate AI response
    let aiResponse = '';
    let structuredData: any = null;
    let ttsText = '';
    
    if (openai) {
      const vehiclesContext = vehiclesData.map(v =>
        `${v.make} ${v.model} ${v.trim} (${v.year}): $${v.msrp.toLocaleString()}, ${v.mpg.combined} MPG, ${v.type}, ${v.drivetrain}, ${v.fuelType}`
      ).join('\n');
      
      const systemPrompt = `You are a helpful AI assistant for Toyota's vehicle shopping and finance platform.
      
Available vehicles:
${vehiclesContext}

When users ask to find vehicles, respond naturally and indicate matching vehicles have been found.
When users ask to compare vehicles, help them understand differences.
Be concise and friendly.`;
      
      const messages: any[] = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.slice(-10).map((msg: any) => ({
          role: msg.from === 'user' ? 'user' : 'assistant',
          content: msg.text,
        })),
        { role: 'user', content: message },
      ];
      
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.7,
          max_tokens: 600,
        });
        
        aiResponse = completion.choices[0].message.content || '';
        ttsText = aiResponse; // For TTS
      } catch (error) {
        console.error('OpenAI error:', error);
        aiResponse = 'I found some vehicles matching your criteria.';
      }
    } else {
      if (isSearch) {
        aiResponse = `I found ${matchingVehicles.length} vehicle(s) matching your criteria.`;
      } else if (isComparison) {
        aiResponse = 'I can help you compare vehicles. Please specify which two vehicles you\'d like to compare.';
      } else {
        aiResponse = 'How can I help you find the perfect Toyota vehicle?';
      }
      ttsText = aiResponse;
    }
    
    // Build structured response
    if (isComparison && matchingVehicles.length >= 2) {
      structuredData = {
        type: 'comparison',
        data: {
          vehicle1: matchingVehicles[0],
          vehicle2: matchingVehicles[1],
        },
      };
    } else if (isSearch) {
      structuredData = {
        type: 'vehicle_list',
        data: matchingVehicles.slice(0, 5),
      };
    }
    
    const response: ChatResponse = {
      response: aiResponse,
      vehicles: isSearch ? matchingVehicles.slice(0, 5) : undefined,
      action: isComparison ? 'compare' : (isSearch ? 'search' : 'chat'),
      error: false,
      structuredData,
      ttsText: voiceInput ? ttsText : undefined,
    };
    
    res.json(response);
  } catch (error) {
    const apiError: ApiError = {
      error: error instanceof Error ? error.message : 'Error processing chat',
      code: 'CHAT_ERROR',
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId,
    };
    res.status(500).json(apiError);
  }
});

// Calculate payment
app.post('/api/calculate-payment', (req: Request, res: Response) => {
  try {
    const params = validateFinancingParams(req.body);
    
    let result: PaymentCalculation;
    
    if (params.isSubscription) {
      result = calculateSubscription(params);
    } else if (params.isLease) {
      result = calculateLease(params);
    } else {
      result = calculatePurchase(params);
    }
    
    // Broadcast real-time update
    io.emit('payment_update', {
      type: 'price_update',
      data: result,
      timestamp: new Date().toISOString(),
    } as RealtimeUpdate);
    
    res.json(result);
  } catch (error) {
    const apiError: ApiError = {
      error: error instanceof Error ? error.message : 'Error calculating payment',
      code: 'CALCULATION_ERROR',
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId,
    };
    res.status(400).json(apiError);
  }
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
  
  // Subscribe to vehicle updates
  socket.on('subscribe_vehicles', () => {
    socket.join('vehicles');
  });
  
  // Subscribe to price updates
  socket.on('subscribe_prices', () => {
    socket.join('prices');
  });
});

// Next Move: voice agent, live screen sync, texting, advisor console
registerNextMove(app, io);

// In the cloud, the same server also serves the built website (npm run build -> dist/)
const distDir = join(__dirname, '..', 'dist');
if (existsSync(join(distDir, 'index.html'))) {
  app.use(express.static(distDir));
  app.get('/', (_req: Request, res: Response) => res.sendFile(join(distDir, 'index.html')));
}

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 WebSocket server ready`);
  if (!openai) {
    console.warn('⚠️  OpenAI API key not configured - chatbot will have limited functionality');
  }
});

