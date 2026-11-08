/**
 * Deterministic Financing Engine
 * Unit-tested formulas for buy/lease/subscription calculations
 */

import type { FinancingParams, PaymentCalculation } from '../../shared/types';

/**
 * Calculate purchase/finance payment
 * Formula: M = P * [r(1+r)^n] / [(1+r)^n - 1]
 * Where: M = monthly payment, P = principal, r = monthly rate, n = term
 */
export function calculatePurchase(params: FinancingParams): PaymentCalculation {
  const { price, downPayment, apr, termMonths, tradeInValue, taxRate } = params;
  
  // Input validation
  if (price <= 0) throw new Error('Price must be positive');
  if (termMonths <= 0) throw new Error('Term must be positive');
  if (downPayment < 0) throw new Error('Down payment cannot be negative');
  if (tradeInValue < 0) throw new Error('Trade-in value cannot be negative');
  if (taxRate < 0 || taxRate > 1) throw new Error('Tax rate must be between 0 and 1');
  
  const tax = price * taxRate;
  const adjustedPrice = price + tax;
  const netPrice = adjustedPrice - tradeInValue - downPayment;
  
  if (netPrice <= 0) {
    // Edge case: trade-in + down payment exceeds price
    return {
      monthlyPayment: 0,
      totalCost: downPayment + tradeInValue,
      totalInterest: 0,
      breakdown: {
        principal: 0,
        interest: 0,
        taxes: tax,
        tradeIn: tradeInValue,
      },
      type: 'purchase',
    };
  }
  
  const monthlyRate = apr / 100 / 12;
  let monthlyPayment: number;
  
  // Edge case: 0% APR
  if (monthlyRate === 0 || apr === 0) {
    monthlyPayment = netPrice / termMonths;
  } else {
    const numerator = netPrice * monthlyRate * Math.pow(1 + monthlyRate, termMonths);
    const denominator = Math.pow(1 + monthlyRate, termMonths) - 1;
    monthlyPayment = numerator / denominator;
  }
  
  const totalCost = monthlyPayment * termMonths + downPayment + tradeInValue;
  const totalInterest = totalCost - adjustedPrice;
  
  return {
    monthlyPayment: Math.round(monthlyPayment),
    totalCost: Math.round(totalCost),
    totalInterest: Math.round(totalInterest),
    breakdown: {
      principal: Math.round(netPrice),
      interest: Math.round(totalInterest),
      taxes: Math.round(tax),
      tradeIn: tradeInValue,
    },
    type: 'purchase',
  };
}

/**
 * Calculate lease payment
 * Formula: Monthly = Depreciation + Finance Charge
 * Depreciation = (Cap Cost - Residual) / Term
 * Finance Charge = (Cap Cost + Residual) * Money Factor
 */
export function calculateLease(params: FinancingParams): PaymentCalculation {
  const { price, downPayment, apr, termMonths, residualValue, tradeInValue, taxRate } = params;
  
  // Input validation
  if (price <= 0) throw new Error('Price must be positive');
  if (termMonths <= 0) throw new Error('Term must be positive');
  if (downPayment < 0) throw new Error('Down payment cannot be negative');
  
  const tax = price * taxRate;
  const adjustedPrice = price + tax;
  const netPrice = adjustedPrice - tradeInValue - downPayment;
  
  // Default residual: 55% of MSRP (typical for 36-month lease)
  const residual = residualValue || Math.round(price * 0.55);
  
  if (residual >= netPrice) {
    throw new Error('Residual value cannot exceed net price');
  }
  
  const depreciation = netPrice - residual;
  const monthlyDepreciation = depreciation / termMonths;
  
  // Convert APR to money factor (APR / 2400)
  const moneyFactor = apr / 2400;
  const monthlyFinance = (netPrice + residual) * moneyFactor;
  
  const monthlyPayment = monthlyDepreciation + monthlyFinance;
  const totalCost = monthlyPayment * termMonths + downPayment + tradeInValue;
  
  return {
    monthlyPayment: Math.round(monthlyPayment),
    totalCost: Math.round(totalCost),
    residualValue: residual,
    breakdown: {
      depreciation: Math.round(monthlyDepreciation),
      finance: Math.round(monthlyFinance),
      taxes: Math.round(tax),
      tradeIn: tradeInValue,
    },
    type: 'lease',
  };
}

/**
 * Calculate subscription payment
 * Includes: vehicle payment + insurance + maintenance
 */
export function calculateSubscription(params: FinancingParams): PaymentCalculation {
  const { price, downPayment, termMonths, tradeInValue, taxRate } = params;
  
  // Input validation
  if (price <= 0) throw new Error('Price must be positive');
  if (termMonths <= 0) throw new Error('Term must be positive');
  
  const tax = price * taxRate;
  const adjustedPrice = price + tax;
  const netPrice = adjustedPrice - tradeInValue - downPayment;
  
  // Base vehicle payment (typically 60% of price over term)
  const vehiclePortion = (netPrice * 0.6) / termMonths;
  
  // Fixed monthly costs
  const insurance = 150; // Estimated monthly insurance
  const maintenance = 100; // Estimated monthly maintenance
  
  const monthlyPayment = vehiclePortion + insurance + maintenance;
  const totalCost = monthlyPayment * termMonths + downPayment + tradeInValue;
  
  return {
    monthlyPayment: Math.round(monthlyPayment),
    totalCost: Math.round(totalCost),
    breakdown: {
      vehicle: Math.round(vehiclePortion),
      insurance: insurance,
      maintenance: maintenance,
      taxes: Math.round(tax),
      tradeIn: tradeInValue,
    },
    type: 'subscription',
  };
}

/**
 * Calculate all three scenarios
 */
export function calculateAllScenarios(params: FinancingParams): {
  buy: PaymentCalculation;
  lease: PaymentCalculation;
  subscription: PaymentCalculation;
} {
  return {
    buy: calculatePurchase(params),
    lease: calculateLease(params),
    subscription: calculateSubscription(params),
  };
}

