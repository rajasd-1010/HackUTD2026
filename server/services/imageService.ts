/**
 * Image Service
 * Validates and maps model→color→image, caches thumbnails, generates CDN URLs
 */

import type { Vehicle, VehicleColor } from '../../shared/types';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// CDN base URL (configurable via env)
const CDN_BASE = process.env.CDN_BASE_URL || 'https://images.toyota.com';

// High-quality placeholder generator
const PLACEHOLDER_BASE = 'https://via.placeholder.com';

/**
 * Generate CDN-friendly URL
 */
export function generateCDNUrl(path: string, width?: number, height?: number): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    // Already a full URL, return as-is or add size params
    if (width && height) {
      const url = new URL(path);
      url.searchParams.set('w', width.toString());
      url.searchParams.set('h', height.toString());
      return url.toString();
    }
    return path;
  }
  
  // Relative path, prepend CDN base
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${CDN_BASE}${cleanPath}`;
  
  if (width && height) {
    const urlObj = new URL(url);
    urlObj.searchParams.set('w', width.toString());
    urlObj.searchParams.set('h', height.toString());
    return urlObj.toString();
  }
  
  return url;
}

/**
 * Generate Toyota-branded placeholder
 */
export function generatePlaceholder(
  model: string,
  color: string,
  width: number = 1200,
  height: number = 800
): string {
  const text = encodeURIComponent(`${model} - ${color}`);
  const bgColor = '1a1a1a';
  const textColor = 'EB0A1E'; // Toyota red
  
  return `${PLACEHOLDER_BASE}/${width}x${height}/${bgColor}/${textColor}?text=${text}`;
}

/**
 * Validate image URL
 */
export async function validateImageUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Get vehicle image for specific color
 * Returns exact color image or fallback
 */
export async function getVehicleImage(
  vehicle: Vehicle,
  colorName?: string,
  colorCode?: string
): Promise<{ url: string; color: VehicleColor; isPlaceholder: boolean }> {
  let selectedColor: VehicleColor | null = null;
  
  // Find matching color
  if (colorName || colorCode) {
    selectedColor = vehicle.colors.find(c => 
      c.name.toLowerCase().includes((colorName || '').toLowerCase()) ||
      c.code.toLowerCase() === (colorCode || '').toLowerCase()
    ) || null;
  }
  
  // Fallback to first color
  if (!selectedColor && vehicle.colors.length > 0) {
    selectedColor = vehicle.colors[0];
  }
  
  // If no colors available, generate placeholder
  if (!selectedColor) {
    const placeholderUrl = generatePlaceholder(
      `${vehicle.make} ${vehicle.model}`,
      'Default'
    );
    return {
      url: placeholderUrl,
      color: {
        name: 'Default',
        code: 'DEF',
        imageUrl: placeholderUrl,
        hex: '#1a1a1a',
      },
      isPlaceholder: true,
    };
  }
  
  // Validate image URL
  const isValid = await validateImageUrl(selectedColor.imageUrl);
  
  if (!isValid) {
    // Generate placeholder if image is invalid
    const placeholderUrl = generatePlaceholder(
      `${vehicle.make} ${vehicle.model}`,
      selectedColor.name
    );
    return {
      url: placeholderUrl,
      color: {
        ...selectedColor,
        imageUrl: placeholderUrl,
      },
      isPlaceholder: true,
    };
  }
  
  // Return CDN-optimized URL
  return {
    url: generateCDNUrl(selectedColor.imageUrl, 1200, 800),
    color: selectedColor,
    isPlaceholder: false,
  };
}

/**
 * Get thumbnail URL (cached)
 */
export function getThumbnailUrl(imageUrl: string, size: number = 400): string {
  return generateCDNUrl(imageUrl, size, size);
}

/**
 * Prefetch and cache images
 */
export async function prefetchImages(vehicles: Vehicle[]): Promise<void> {
  // In production, this would integrate with a CDN cache
  // For now, just validate URLs
  const imagePromises = vehicles.flatMap(vehicle =>
    vehicle.colors.map(color => validateImageUrl(color.imageUrl))
  );
  
  await Promise.allSettled(imagePromises);
}

