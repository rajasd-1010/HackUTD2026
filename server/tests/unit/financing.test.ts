/**
 * Unit tests for financing engine
 * Tests all edge cases including 0% APR, missing inputs, etc.
 */

import { describe, it, expect } from 'vitest';
import {
  calculatePurchase,
  calculateLease,
  calculateSubscription,
  calculateAllScenarios,
} from '../../services/financing';

describe('Financing Engine', () => {
  const baseParams = {
    price: 30000,
    downPayment: 2000,
    apr: 5.5,
    termMonths: 60,
    isLease: false,
    isSubscription: false,
    tradeInValue: 0,
    taxRate: 0.08,
  };

  describe('calculatePurchase', () => {
    it('should calculate standard purchase correctly', () => {
      const result = calculatePurchase(baseParams);
      
      expect(result.type).toBe('purchase');
      expect(result.monthlyPayment).toBeGreaterThan(0);
      expect(result.totalCost).toBeGreaterThan(result.monthlyPayment);
      expect(result.totalInterest).toBeGreaterThan(0);
      expect(result.breakdown.principal).toBeGreaterThan(0);
      expect(result.breakdown.interest).toBeGreaterThan(0);
    });

    it('should handle 0% APR correctly', () => {
      const result = calculatePurchase({ ...baseParams, apr: 0 });
      
      expect(result.type).toBe('purchase');
      expect(result.monthlyPayment).toBeGreaterThan(0);
      expect(result.totalInterest).toBe(0);
    });

    it('should handle trade-in value', () => {
      const result = calculatePurchase({ ...baseParams, tradeInValue: 5000 });
      
      expect(result.monthlyPayment).toBeLessThan(
        calculatePurchase(baseParams).monthlyPayment
      );
      expect(result.breakdown.tradeIn).toBe(5000);
    });

    it('should handle large down payment', () => {
      const result = calculatePurchase({ ...baseParams, downPayment: 25000 });
      
      expect(result.monthlyPayment).toBeGreaterThan(0);
      expect(result.totalCost).toBeGreaterThan(25000);
    });

    it('should throw error for invalid price', () => {
      expect(() => calculatePurchase({ ...baseParams, price: -1000 })).toThrow();
      expect(() => calculatePurchase({ ...baseParams, price: 0 })).toThrow();
    });

    it('should throw error for invalid term', () => {
      expect(() => calculatePurchase({ ...baseParams, termMonths: 0 })).toThrow();
      expect(() => calculatePurchase({ ...baseParams, termMonths: -10 })).toThrow();
    });

    it('should handle edge case: trade-in exceeds price', () => {
      const result = calculatePurchase({
        ...baseParams,
        price: 10000,
        tradeInValue: 15000,
      });
      
      expect(result.monthlyPayment).toBe(0);
      expect(result.totalCost).toBeGreaterThan(0);
    });
  });

  describe('calculateLease', () => {
    it('should calculate lease correctly', () => {
      const result = calculateLease({
        ...baseParams,
        isLease: true,
        termMonths: 36,
        apr: 3.9,
      });
      
      expect(result.type).toBe('lease');
      expect(result.monthlyPayment).toBeGreaterThan(0);
      expect(result.residualValue).toBeGreaterThan(0);
      expect(result.breakdown.depreciation).toBeGreaterThan(0);
      expect(result.breakdown.finance).toBeGreaterThan(0);
    });

    it('should use default residual if not provided', () => {
      const result = calculateLease({
        ...baseParams,
        isLease: true,
        termMonths: 36,
      });
      
      expect(result.residualValue).toBe(Math.round(baseParams.price * 0.55));
    });

    it('should throw error if residual exceeds net price', () => {
      expect(() =>
        calculateLease({
          ...baseParams,
          isLease: true,
          residualValue: 50000,
        })
      ).toThrow();
    });
  });

  describe('calculateSubscription', () => {
    it('should calculate subscription correctly', () => {
      const result = calculateSubscription({
        ...baseParams,
        isSubscription: true,
        termMonths: 36,
      });
      
      expect(result.type).toBe('subscription');
      expect(result.monthlyPayment).toBeGreaterThan(0);
      expect(result.breakdown.vehicle).toBeGreaterThan(0);
      expect(result.breakdown.insurance).toBe(150);
      expect(result.breakdown.maintenance).toBe(100);
    });
  });

  describe('calculateAllScenarios', () => {
    it('should calculate all three scenarios', () => {
      const result = calculateAllScenarios(baseParams);
      
      expect(result.buy).toBeDefined();
      expect(result.lease).toBeDefined();
      expect(result.subscription).toBeDefined();
      
      expect(result.buy.type).toBe('purchase');
      expect(result.lease.type).toBe('lease');
      expect(result.subscription.type).toBe('subscription');
    });

    it('should have consistent pricing across scenarios', () => {
      const result = calculateAllScenarios(baseParams);
      
      // Subscription should typically be highest monthly
      expect(result.subscription.monthlyPayment).toBeGreaterThan(
        result.lease.monthlyPayment
      );
      expect(result.subscription.monthlyPayment).toBeGreaterThan(
        result.buy.monthlyPayment
      );
    });
  });
});

