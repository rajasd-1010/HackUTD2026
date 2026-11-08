import { describe, it, expect } from 'vitest';
import { customers, getCustomer } from '../../nextmove/customers';
import { computeNextMove, amortize } from '../../nextmove/engine';
import { findTerm } from '../../nextmove/glossary';

describe('next move engine', () => {
  it('produces at least two options with a single recommendation for every customer', () => {
    for (const c of customers) {
      const r = computeNextMove(c, {});
      expect(r.options.length).toBeGreaterThanOrEqual(2);
      expect(r.options.filter((o) => o.recommended)).toHaveLength(1);
    }
  });
  it('recommends refinancing once they say their credit is excellent', () => {
    const r = computeNextMove(getCustomer('marcus')!, { creditBand: 'excellent' });
    expect(r.recommendedId).toBe('refinance');
    const refi = r.options.find((o) => o.id === 'refinance')!;
    expect(refi.monthlyPayment!).toBeLessThan(512);
  });
  it('routes financial stress to a human and never to an upgrade', () => {
    const r = computeNextMove(getCustomer('priya')!, { financialStress: true });
    expect(r.recommendedId).toBe('relief');
    expect(r.options[0].requiresHuman).toBe(true);
  });
  it('favors a 3-row upgrade when the family is growing', () => {
    const r = computeNextMove(getCustomer('maya')!, { needsMoreSpace: true });
    expect(r.recommendedId).toMatch(/grand-highlander|sienna/);
  });
  it('keeps a truck owner in a truck when they need one', () => {
    const r = computeNextMove(getCustomer('diego')!, { needsSameVehicleType: true, priority: 'save_fuel' });
    expect(r.recommendedId).not.toMatch(/camry/);
  });
  it('flags options over budget', () => {
    const r = computeNextMove(getCustomer('maya')!, { budgetMaxMonthly: 500, needsMoreSpace: true });
    expect(r.options.find((o) => o.id.includes('grand-highlander'))!.overBudget).toBe(true);
  });
  it('amortizes correctly', () => {
    expect(Math.round(amortize(20000, 6, 60))).toBe(387);
  });
  it('finds glossary terms loosely', () => {
    expect(findTerm('residual')?.key).toBe('residual value');
    expect(findTerm('APR')?.key).toBe('apr');
  });
});

import { computeGuestMoves } from '../../nextmove/engine';
import { findByCode, createGuest } from '../../nextmove/profiles';

describe('new customers and codes', () => {
  it('finds demo customers by spoken or typed code', () => {
    expect(findByCode('TM-4821')?.id).toBe('maya');
    expect(findByCode('tm four eight two one')?.id).toBe('maya');
    expect(findByCode('7390')?.id).toBe('marcus');
    expect(findByCode('TM-0000')).toBeUndefined();
  });
  it('gives new customers a unique ID', () => {
    const a = createGuest('Raj Danekar');
    const b = createGuest('Raj Danekar');
    expect(a.id).toMatch(/^NEW-\d{4}$/);
    expect(a.id).not.toBe(b.id);
    expect(a.firstName).toBe('Raj');
  });
  it('builds buy, lease and certified options for a new customer', () => {
    const r = computeGuestMoves({ vehicleInterest: 'a Camry', budgetMaxMonthly: 450, downPayment: 3000, creditBand: 'good', wants: 'lease' });
    expect(r.options.map((o) => o.id)).toEqual(expect.arrayContaining(['buy_new', 'lease_new', 'cpo']));
    expect(r.options.filter((o) => o.recommended)).toHaveLength(1);
    expect(r.situation.vehicle).toBe('Camry');
  });
});
