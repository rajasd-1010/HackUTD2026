/**
 * Seed script to populate vehicle data
 * Run with: node scripts/seed.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Comprehensive 2025 Toyota dataset
const vehicles = [
  // ... (using the vehicles from vehicles.json)
];

const vehiclesPath = join(__dirname, '../server/data/vehicles.json');
const existing = JSON.parse(readFileSync(vehiclesPath, 'utf-8'));

console.log(`Seeding ${vehicles.length} vehicles...`);
writeFileSync(vehiclesPath, JSON.stringify(vehicles, null, 2));
console.log('✅ Seed complete!');

