/**
 * Shared TypeScript types for Toyota Finance App
 * Used by both frontend and backend
 */

// Vehicle Types
export interface VehicleColor {
  name: string;
  code: string;
  imageUrl: string;
  hex: string;
}

export interface VehicleEngine {
  displacement: string;
  cylinders: number;
  type: string;
  horsepower: number;
  torque: number;
}

export interface VehicleMPG {
  combined: number;
  city: number;
  highway: number;
  electricRange?: number;
}

export interface VehicleDimensions {
  length: number;
  width: number;
  height: number;
  wheelbase: number;
}

export interface Vehicle {
  id: string;
  vin: string;
  make: string;
  model: string;
  trim: string;
  year: number;
  msrp: number;
  dealerPrice: number;
  type: string;
  category: string;
  mpg: VehicleMPG;
  drivetrain: string;
  electrified: boolean;
  fuelType: string;
  engine: VehicleEngine;
  transmission: string;
  seats: number;
  dimensions: VehicleDimensions;
  colors: VehicleColor[];
  features: string[];
  description: string;
}

// API Request/Response Types
export interface VehiclesQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: string;
  make?: string;
  drivetrain?: string;
  fuelType?: string;
  minPrice?: number;
  maxPrice?: number;
  minMpg?: number;
  color?: string;
}

export interface VehiclesResponse {
  vehicles: Vehicle[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface CompareRequest {
  vehicle1?: string;
  vehicle2?: string;
  query?: string;
  color1?: string;
  color2?: string;
}

export interface ComparisonResult {
  vehicle1: Vehicle & { selectedColor: VehicleColor; imageUrl: string };
  vehicle2: Vehicle & { selectedColor: VehicleColor; imageUrl: string };
  differences: {
    price: number;
    mpg: number;
    horsepower: number;
  };
  similarities: string[];
  financing: {
    vehicle1: FinancingBreakdown;
    vehicle2: FinancingBreakdown;
  };
}

export interface ChatRequest {
  message: string;
  conversationHistory?: ChatMessage[];
  voiceInput?: boolean;
}

export interface ChatMessage {
  from: 'user' | 'bot';
  text: string;
  timestamp?: string;
}

export interface ChatResponse {
  response: string;
  vehicles?: Vehicle[];
  comparison?: ComparisonResult;
  action: 'search' | 'compare' | 'chat' | 'finance';
  error: boolean;
  structuredData?: {
    type: 'vehicle_list' | 'comparison' | 'finance';
    data: any;
  };
  ttsText?: string;
}

// Financing Types
export interface FinancingParams {
  price: number;
  downPayment: number;
  apr: number;
  termMonths: number;
  isLease: boolean;
  isSubscription: boolean;
  residualValue?: number;
  tradeInValue: number;
  taxRate: number;
}

export interface FinancingBreakdown {
  buy: {
    monthly: number;
    total: number;
    interest: number;
  };
  lease: {
    monthly: number;
    total: number;
    residual: number;
  };
  subscription: {
    monthly: number;
    total: number;
    breakdown: {
      vehicle: number;
      insurance: number;
      maintenance: number;
    };
  };
}

export interface PaymentCalculation {
  monthlyPayment: number;
  totalCost: number;
  totalInterest?: number;
  residualValue?: number;
  breakdown: {
    principal?: number;
    interest?: number;
    taxes: number;
    tradeIn?: number;
    depreciation?: number;
    finance?: number;
    vehicle?: number;
    insurance?: number;
    maintenance?: number;
  };
  type: 'purchase' | 'lease' | 'subscription';
}

// NLU Types
export interface NLUResult {
  intent: 'search' | 'compare' | 'filter' | 'finance';
  entities: {
    vehicles?: string[];
    colors?: string[];
    priceRange?: { min?: number; max?: number };
    filters?: {
      type?: string;
      drivetrain?: string;
      fuelType?: string;
      make?: string;
      model?: string;
      mpg?: number;
    };
  };
  confidence: number;
}

// Error Types
export interface ApiError {
  error: string;
  code: string;
  details?: any;
  timestamp: string;
  requestId?: string;
}

// Health Check
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  version: string;
  services: {
    database: 'ok' | 'degraded' | 'down';
    openai: 'ok' | 'degraded' | 'down';
    imageService: 'ok' | 'degraded' | 'down';
  };
}

// Real-time Update Types
export interface RealtimeUpdate {
  type: 'vehicle_update' | 'price_update' | 'filter_update';
  data: any;
  timestamp: string;
}

// Accessibility Types
export interface AccessibilitySettings {
  mode: 'standard' | 'kid' | 'senior';
  reducedMotion: boolean;
  highContrast: boolean;
  largeText: boolean;
  voiceEnabled: boolean;
  keyboardOnly: boolean;
}

