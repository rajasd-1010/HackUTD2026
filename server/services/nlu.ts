/**
 * NLU Service with Fuse.js for fuzzy matching
 * Entity extraction, intent detection, color mapping
 */

import Fuse from 'fuse.js';
import type { Vehicle, VehicleColor, NLUResult } from '../../shared/types';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load vehicle data
let vehiclesData: Vehicle[] = [];
try {
  vehiclesData = JSON.parse(
    readFileSync(join(__dirname, '../data/vehicles.json'), 'utf-8')
  );
} catch (error) {
  console.warn('Could not load vehicles.json');
}

// Configure Fuse.js for fuzzy vehicle search
const fuseOptions = {
  keys: [
    { name: 'model', weight: 0.5 },
    { name: 'make', weight: 0.3 },
    { name: 'trim', weight: 0.2 },
    { name: 'description', weight: 0.1 },
  ],
  threshold: 0.4, // 0 = exact match, 1 = match anything
  includeScore: true,
};

const vehicleFuse = new Fuse(vehiclesData, fuseOptions);

// Color mapping with synonyms
const COLOR_SYNONYMS: Record<string, string[]> = {
  'white': ['white', 'pearl', 'ice', 'snow', 'wht', 'wind chill', 'platinum'],
  'black': ['black', 'midnight', 'jet', 'onyx', 'blk', 'obsidian'],
  'red': ['red', 'ruby', 'flare', 'supersonic', 'soul red', 'radiant', 'crimson'],
  'blue': ['blue', 'blueprint', 'still night', 'navy', 'azure', 'cobalt'],
  'silver': ['silver', 'celestial', 'metallic', 'slv', 'chrome'],
  'gray': ['gray', 'grey', 'lunar', 'meteoroid', 'polymetal', 'charcoal'],
  'grey': ['gray', 'grey', 'lunar', 'meteoroid', 'polymetal', 'charcoal'],
};

/**
 * Extract color from text
 */
export function extractColor(text: string, vehicle?: Vehicle): VehicleColor | null {
  const lowerText = text.toLowerCase();
  
  // Check against color synonyms
  for (const [color, synonyms] of Object.entries(COLOR_SYNONYMS)) {
    for (const synonym of synonyms) {
      if (lowerText.includes(synonym)) {
        // If vehicle provided, find exact match
        if (vehicle) {
          const match = vehicle.colors.find(c =>
            c.name.toLowerCase().includes(synonym) ||
            c.code.toLowerCase() === color.toUpperCase().substring(0, 3)
          );
          if (match) return match;
        }
        
        // Return generic color
        return {
          name: color.charAt(0).toUpperCase() + color.slice(1),
          code: color.toUpperCase().substring(0, 3),
          imageUrl: '',
          hex: '#000000',
        };
      }
    }
  }
  
  return null;
}

/**
 * Extract price range from text
 */
export function extractPriceRange(text: string): { min?: number; max?: number } {
  const lowerText = text.toLowerCase();
  const range: { min?: number; max?: number } = {};
  
  // Keywords
  if (lowerText.includes('affordable') || lowerText.includes('budget') || lowerText.includes('cheap')) {
    range.max = 30000;
  }
  if (lowerText.includes('luxury') || lowerText.includes('premium') || lowerText.includes('high-end')) {
    range.min = 50000;
  }
  
  // Numeric patterns
  const underMatch = lowerText.match(/under\s*\$?(\d{1,3}(?:,\d{3})*(?:k|thousand)?)/i);
  if (underMatch) {
    const value = parsePrice(underMatch[1]);
    range.max = value;
  }
  
  const overMatch = lowerText.match(/(?:over|above|more than)\s*\$?(\d{1,3}(?:,\d{3})*(?:k|thousand)?)/i);
  if (overMatch) {
    const value = parsePrice(overMatch[1]);
    range.min = value;
  }
  
  const rangeMatch = lowerText.match(/\$?(\d{1,3}(?:,\d{3})*(?:k|thousand)?)\s*[-–—]\s*\$?(\d{1,3}(?:,\d{3})*(?:k|thousand)?)/i);
  if (rangeMatch) {
    range.min = parsePrice(rangeMatch[1]);
    range.max = parsePrice(rangeMatch[2]);
  }
  
  return range;
}

function parsePrice(priceStr: string): number {
  const clean = priceStr.replace(/[,k]/gi, '');
  const num = parseInt(clean, 10);
  return priceStr.toLowerCase().includes('k') ? num * 1000 : num;
}

/**
 * Detect intent from text
 */
export function detectIntent(text: string): 'search' | 'compare' | 'filter' | 'finance' {
  const lowerText = text.toLowerCase();
  
  if (/vs|versus|compared? to|compare/i.test(lowerText)) {
    return 'compare';
  }
  if (/finance|payment|lease|buy|purchase|monthly|afford|price|cost/i.test(lowerText)) {
    return 'finance';
  }
  if (/filter|only|just|with|has|need|must/i.test(lowerText)) {
    return 'filter';
  }
  
  return 'search';
}

/**
 * Extract entities using fuzzy matching
 */
export function extractEntities(text: string): NLUResult['entities'] {
  const entities: NLUResult['entities'] = {};
  const lowerText = text.toLowerCase();
  
  // Fuzzy match vehicles
  const vehicleResults = vehicleFuse.search(text, { limit: 5 });
  if (vehicleResults.length > 0) {
    entities.vehicles = vehicleResults.map(r => r.item.id);
  }
  
  // Extract colors
  const colors: string[] = [];
  for (const [color, synonyms] of Object.entries(COLOR_SYNONYMS)) {
    for (const synonym of synonyms) {
      if (lowerText.includes(synonym)) {
        colors.push(color);
        break;
      }
    }
  }
  if (colors.length > 0) {
    entities.colors = colors;
  }
  
  // Extract price range
  const priceRange = extractPriceRange(text);
  if (priceRange.min || priceRange.max) {
    entities.priceRange = priceRange;
  }
  
  // Extract filters
  const filters: NLUResult['entities']['filters'] = {};
  
  if (/suv|sport utility/i.test(lowerText)) filters.type = 'SUV';
  else if (/sedan/i.test(lowerText)) filters.type = 'Sedan';
  else if (/truck|pickup/i.test(lowerText)) filters.type = 'Truck';
  
  if (/\bawd\b/i.test(lowerText)) filters.drivetrain = 'AWD';
  else if (/\b4wd\b/i.test(lowerText)) filters.drivetrain = '4WD';
  else if (/\bfwd\b/i.test(lowerText)) filters.drivetrain = 'FWD';
  
  if (/hybrid/i.test(lowerText)) {
    if (/plug-in|plugin|phev/i.test(lowerText)) {
      filters.fuelType = 'Plug-in Hybrid';
    } else {
      filters.fuelType = 'Hybrid';
    }
  } else if (/electric|ev|battery/i.test(lowerText)) {
    filters.fuelType = 'Electric';
  } else if (/gas|gasoline/i.test(lowerText)) {
    filters.fuelType = 'Gasoline';
  }
  
  // Extract make
  const makes = ['toyota', 'honda', 'mazda', 'ford', 'nissan'];
  for (const make of makes) {
    if (lowerText.includes(make)) {
      filters.make = make.charAt(0).toUpperCase() + make.slice(1);
      break;
    }
  }
  
  // Extract MPG
  const mpgMatch = lowerText.match(/(\d+)\s*mpg/i);
  if (mpgMatch) {
    filters.mpg = parseInt(mpgMatch[1], 10);
  } else if (/efficient|good gas/i.test(lowerText)) {
    filters.mpg = 35;
  }
  
  if (Object.keys(filters).length > 0) {
    entities.filters = filters;
  }
  
  return entities;
}

/**
 * Parse comparison query (e.g., "blue Camry vs silver Accord")
 */
export function parseComparison(text: string): {
  vehicle1?: { vehicle: Vehicle; color?: VehicleColor };
  vehicle2?: { vehicle: Vehicle; color?: VehicleColor };
} {
  const parts = text.split(/\s+vs\.?\s+|versus|compared to|compare/i);
  
  if (parts.length < 2) {
    return {};
  }
  
  const part1 = parts[0].trim();
  const part2 = parts[1].trim();
  
  // Find vehicles
  const results1 = vehicleFuse.search(part1, { limit: 1 });
  const results2 = vehicleFuse.search(part2, { limit: 1 });
  
  const vehicle1 = results1.length > 0 ? results1[0].item : undefined;
  const vehicle2 = results2.length > 0 ? results2[0].item : undefined;
  
  // Extract colors
  const color1 = extractColor(part1, vehicle1);
  const color2 = extractColor(part2, vehicle2);
  
  return {
    vehicle1: vehicle1 ? { vehicle: vehicle1, color: color1 || undefined } : undefined,
    vehicle2: vehicle2 ? { vehicle: vehicle2, color: color2 || undefined } : undefined,
  };
}

/**
 * Main NLU function
 */
export function parseQuery(text: string): NLUResult {
  const intent = detectIntent(text);
  const entities = extractEntities(text);
  
  // Calculate confidence based on entity extraction
  let confidence = 0.5; // Base confidence
  if (entities.vehicles && entities.vehicles.length > 0) confidence += 0.3;
  if (entities.colors && entities.colors.length > 0) confidence += 0.1;
  if (entities.priceRange) confidence += 0.1;
  
  return {
    intent,
    entities,
    confidence: Math.min(confidence, 1.0),
  };
}

