/**
 * Next Move engine.
 * Deterministic: every number the voice agent says comes from here, never from the LLM.
 * Reuses the unit-tested formulas in services/financing.ts.
 */

import { calculatePurchase, calculateLease } from '../services/financing.js';
import { observedMilesPerYear, type CustomerProfile } from './customers.js';

export type Priority =
  | 'lowest_payment'
  | 'own_it'
  | 'newest_tech'
  | 'flexibility'
  | 'save_fuel'
  | 'pay_off_fast';

export interface Answers {
  lifeChange?: string;
  needsMoreSpace?: boolean;
  milesPerYear?: number;
  budgetMaxMonthly?: number;
  priority?: Priority;
  keepYears?: number;
  financialStress?: boolean;
  interestedInUpgrade?: boolean;
  needsSameVehicleType?: boolean; // e.g. still needs a truck bed
  // New (non-)customers
  vehicleInterest?: string;
  downPayment?: number;
  creditBand?: CreditBand;
  wants?: 'buy' | 'lease' | 'unsure';
  currentCar?: string;
}

export type CreditBand = 'excellent' | 'good' | 'fair' | 'rebuilding';

export type NextStepType = 'self_service' | 'follow_up' | 'eligible_offer' | 'human_advisor';

export interface MoveOption {
  id: string;
  kind: 'return' | 'buyout' | 'upgrade' | 'keep' | 'refinance' | 'pay_extra' | 'relief';
  title: string;
  headline: string; // one short sentence, good for speaking
  monthlyPayment: number | null;
  upfrontCost: number | null;
  impactLabel: string; // e.g. "Saves $1,840 over the loan"
  impactValue: number; // signed dollars; positive = good for the customer
  pros: string[];
  cons: string[];
  plain: string; // plain-language explanation
  assumptions: string[];
  terms: string[]; // glossary terms this option relies on (for Learn)
  nextStep: { type: NextStepType; label: string };
  businessValue: { retention: 'retain' | 'at_risk' | 'neutral'; revenue: string | null; serviceEffort: string };
  requiresHuman?: boolean;
  overBudget?: boolean;
  score: number;
  recommended?: boolean;
}

export interface NextMoveResult {
  situation: Record<string, string | number>;
  options: MoveOption[];
  recommendedId: string | null;
  notes: string[];
}

// ---------- Assumptions (synthetic, shown to the user in plain language) ----------
export const ASSUMPTIONS = {
  taxRate: 0.0625, // Texas motor vehicle sales tax
  gasPrice: 3.1, // $/gal, DFW synthetic average
  depreciationPerMonth: 0.008, // used-car value drift for projecting lease-end value
  newLeaseTerm: 36,
  newLoanTerm: 60,
  newLeaseResidualPct: 0.58,
};

export function tierApr(score: number): number {
  if (score >= 720) return 5.4;
  if (score >= 680) return 6.9;
  if (score >= 640) return 8.9;
  return 11.9;
}

export function tierLeaseApr(score: number): number {
  return score >= 720 ? 3.9 : 5.5;
}

/** Standard amortized payment. */
export function amortize(principal: number, apr: number, months: number): number {
  if (principal <= 0) return 0;
  const r = apr / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

/** Months to pay off and interest paid, given a fixed monthly payment. */
export function payoffSchedule(principal: number, apr: number, payment: number) {
  const r = apr / 100 / 12;
  let bal = principal;
  let months = 0;
  let interest = 0;
  while (bal > 0.005 && months < 600) {
    const i = bal * r;
    interest += i;
    bal = bal + i - payment;
    months++;
  }
  return { months, interest };
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

function fuelMonthly(milesPerYear: number, mpg: number) {
  return (milesPerYear / 12 / mpg) * ASSUMPTIONS.gasPrice;
}

export function computeNextMove(c: CustomerProfile, answers: Answers = {}): NextMoveResult {
  const milesPerYear = answers.milesPerYear ?? observedMilesPerYear(c);
  const options: MoveOption[] = [];
  const notes: string[] = [];
  const situation: Record<string, string | number> = {
    vehicle: `${c.vehicle.year} ${c.vehicle.model} ${c.vehicle.trim}`,
    contract: c.contract.type,
    monthlyPayment: c.contract.monthlyPayment,
    monthsRemaining: c.contract.monthsRemaining,
    estMarketValue: c.vehicle.estMarketValue,
    milesPerYear,
  };

  const hardship = answers.financialStress === true;

  if (c.contract.type === 'lease') {
    buildLeaseOptions(c, answers, milesPerYear, situation, options);
  } else {
    buildLoanOptions(c, answers, milesPerYear, situation, options);
  }

  if (hardship) {
    options.push({
      id: 'relief',
      kind: 'relief',
      title: 'Get help with your payments',
      headline: 'Talk with a Toyota specialist about options like moving your due date or a payment extension.',
      monthlyPayment: null,
      upfrontCost: null,
      impactLabel: 'Protects your credit and keeps your car',
      impactValue: 0,
      pros: ['A real person reviews your situation', 'Can prevent late fees and credit damage', 'No commitment to talk'],
      cons: ['Not automatic. Approval depends on review', 'An extension can add interest over time'],
      plain:
        "If money is tight right now, the worst move is staying quiet. Toyota can sometimes move your due date or extend a payment. A specialist has to review it, so I won't promise anything, but I can connect you.",
      assumptions: ['No relief is promised. A human specialist decides.'],
      terms: ['payment extension', 'due date change'],
      nextStep: { type: 'human_advisor', label: 'Connect with a Toyota payment specialist' },
      businessValue: { retention: 'retain', revenue: 'Prevents delinquency and charge-off', serviceEffort: 'Warm handoff with full context' },
      requiresHuman: true,
      score: 0,
    });
  }

  // ---------- Scoring ----------
  for (const o of options) {
    let s = 50;
    if (answers.budgetMaxMonthly && o.monthlyPayment !== null && o.monthlyPayment > answers.budgetMaxMonthly) {
      s -= 30;
      o.overBudget = true;
    }
    switch (answers.priority) {
      case 'lowest_payment':
        if (o.monthlyPayment !== null) s += Math.max(0, 25 - o.monthlyPayment / 40);
        if (o.kind === 'refinance') s += 15;
        break;
      case 'own_it':
        if (o.kind === 'buyout' || o.kind === 'keep' || o.kind === 'pay_extra') s += 20;
        break;
      case 'newest_tech':
        if (o.kind === 'upgrade') s += 25;
        break;
      case 'flexibility':
        if (o.kind === 'return' || o.kind === 'upgrade') s += 15;
        break;
      case 'save_fuel':
        if (o.kind === 'upgrade' && /hybrid/i.test(o.title)) s += 20;
        break;
      case 'pay_off_fast':
        if (o.kind === 'pay_extra' || o.kind === 'refinance') s += 20;
        break;
    }
    if (answers.needsMoreSpace) {
      if (o.kind === 'upgrade' && /Grand Highlander|Highlander|Sienna/.test(o.title)) s += 25;
      if (o.kind === 'buyout' || o.kind === 'keep') s -= 10;
    }
    if (c.contract.type === 'lease' && milesPerYear > (c.contract.mileageAllowancePerYear ?? 12000) * 1.15) {
      if (o.kind === 'buyout') s += 12; // miles stop mattering once you own it
    }
    if (answers.needsSameVehicleType && o.kind === 'upgrade' && !o.title.includes(c.vehicle.model.split(' ')[0])) s -= 40;
    if (o.kind === 'refinance') s += 10; // free money when it qualifies
    s += Math.max(-10, Math.min(15, o.impactValue / 400));
    if (hardship) {
      if (o.kind === 'relief') s += 60;
      if (o.kind === 'upgrade') s -= 40;
    }
    o.score = Math.round(s);
  }
  options.sort((a, b) => b.score - a.score);
  const rec = options[0] ?? null;
  if (rec) rec.recommended = true;

  if (c.service.openRecalls > 0) notes.push(`There is ${c.service.openRecalls} open recall on this vehicle. It's a free fix at any Toyota dealer.`);
  if (c.service.toyotaCareMonthsLeft > 0 && c.service.toyotaCareMonthsLeft <= 2)
    notes.push('ToyotaCare free maintenance ends soon. Book the next service before it expires.');

  return { situation, options, recommendedId: rec?.id ?? null, notes };
}

function buildLeaseOptions(
  c: CustomerProfile,
  answers: Answers,
  milesPerYear: number,
  situation: Record<string, string | number>,
  options: MoveOption[],
) {
  const k = c.contract;
  const allowed = ((k.mileageAllowancePerYear ?? 12000) * k.termMonths) / 12;
  const projectedMiles = Math.round(c.vehicle.odometer + (milesPerYear / 12) * k.monthsRemaining);
  const overMiles = Math.max(0, projectedMiles - allowed);
  const overCost = Math.round(overMiles * (k.excessMileFee ?? 0.25));
  const valueAtEnd = Math.round(c.vehicle.estMarketValue * (1 - ASSUMPTIONS.depreciationPerMonth * k.monthsRemaining));
  const residual = k.residualValue ?? k.payoffAmount;
  const equity = valueAtEnd - residual;
  const band: CreditBand = answers.creditBand ?? 'good';
  const apr = BAND_APR[band];

  Object.assign(situation, {
    projectedMilesAtEnd: projectedMiles,
    mileageAllowance: allowed,
    projectedOverMiles: overMiles,
    projectedOverMileCost: overCost,
    residualValue: residual,
    projectedValueAtEnd: valueAtEnd,
    leaseEquity: equity,
  });

  // 1. Return
  options.push({
    id: 'return',
    kind: 'return',
    title: `Hand back your ${c.vehicle.model}`,
    headline: `Hand back the keys and pay about ${money((k.dispositionFee ?? 350) + overCost)} in end-of-lease fees.`,
    monthlyPayment: 0,
    upfrontCost: (k.dispositionFee ?? 350) + overCost,
    impactLabel: equity > 0 ? `You'd leave about ${money(equity)} of value behind` : 'Nothing left on the table',
    impactValue: -Math.max(0, equity) - overCost,
    pros: ['Simplest exit', 'No more payments on this car'],
    cons: [
      overMiles > 0 ? `About ${overMiles.toLocaleString()} miles over, roughly ${money(overCost)}` : 'Inspection for wear and tear',
      equity > 0 ? `You'd give Toyota a car worth more than the buyout` : 'You still need another car',
    ],
    plain: `Returning is the easy exit, but you're projected to be ${overMiles.toLocaleString()} miles over your allowance, and the car should be worth about ${money(valueAtEnd)} while your buyout price is ${money(residual)}. Returning it means paying the mileage fee and walking away from that difference.`,
    assumptions: [`Excess miles billed at $${k.excessMileFee}/mile`, `Disposition fee ${money(k.dispositionFee ?? 350)}`, 'Normal wear only'],
    terms: ['disposition fee', 'excess mileage', 'lease equity'],
    nextStep: { type: 'self_service', label: 'Schedule a lease-end inspection' },
    businessValue: { retention: 'at_risk', revenue: null, serviceEffort: 'Self-service scheduling' },
    score: 0,
  });

  // 2. Buy out
  const buyPrice = residual + (k.purchaseOptionFee ?? 300);
  const buy = calculatePurchase({
    price: buyPrice, downPayment: 0, apr, termMonths: ASSUMPTIONS.newLoanTerm,
    isLease: false, isSubscription: false, tradeInValue: 0, taxRate: ASSUMPTIONS.taxRate,
  });
  options.push({
    id: 'buyout',
    kind: 'buyout',
    title: `Keep your ${c.vehicle.model} for good`,
    headline: `Buy it for about ${money(buyPrice)}. That's around ${money(buy.monthlyPayment)} a month over 5 years, and the extra miles stop costing you.`,
    monthlyPayment: buy.monthlyPayment,
    upfrontCost: 0,
    impactLabel: equity > 0 ? `Keeps about ${money(equity)} of value and skips ${money(overCost)} in mileage fees` : 'Skips the mileage fees',
    impactValue: Math.max(0, equity) + overCost,
    pros: ['Mileage overage disappears', 'You keep a car you already know', equity > 0 ? `Buyout is below market value by about ${money(equity)}` : 'Predictable cost'],
    cons: ['Monthly payment goes up vs. your lease', 'Out of warranty sooner than a new car', 'Still 5 seats'],
    plain: `Your lease set a buyout price of ${money(residual)} back in ${k.startDate.slice(0, 4)}. Today the car is worth more than that, so buying it is like getting it at a discount. Once you own it, nobody charges you for extra miles.`,
    assumptions: [`Financed at ${apr}% APR for 60 months for ${band} credit`, `TX sales tax ${ASSUMPTIONS.taxRate * 100}%`, `Purchase option fee ${money(k.purchaseOptionFee ?? 300)}`],
    terms: ['residual value', 'buyout', 'apr', 'lease equity'],
    nextStep: { type: 'eligible_offer', label: 'Get a pre-qualified lease-buyout loan offer' },
    businessValue: { retention: 'retain', revenue: 'New TFS buyout loan', serviceEffort: 'Self-service up to e-sign' },
    score: 0,
  });

  // 3+. Upgrade via new lease, applying lease-end equity
  const lApr = BAND_LEASE[band];
  for (const cand of upgradeCandidates(c, answers)) {
    const credit = Math.max(0, equity);
    let monthly: number;
    try {
      monthly = calculateLease({
        price: cand.msrp, downPayment: 0, apr: lApr, termMonths: ASSUMPTIONS.newLeaseTerm,
        isLease: true, isSubscription: false, residualValue: Math.round(cand.msrp * ASSUMPTIONS.newLeaseResidualPct),
        tradeInValue: credit, taxRate: ASSUMPTIONS.taxRate,
      }).monthlyPayment;
    } catch {
      continue;
    }
    const fuelDelta = Math.round(fuelMonthly(milesPerYear, c.vehicle.mpg) - fuelMonthly(milesPerYear, cand.mpg));
    const suggestedAllowance = milesPerYear > 13000 ? 15000 : 12000;
    options.push({
      id: `upgrade-${slug(cand.model)}`,
      kind: 'upgrade',
      title: `Switch to a new ${cand.model}`,
      headline: `Lease a new ${cand.model} for about ${money(monthly)} a month, using your ${c.vehicle.model}'s equity as credit.`,
      monthlyPayment: monthly,
      upfrontCost: 0,
      impactLabel: credit > 0 ? `Your ${c.vehicle.model} gives you ${money(credit)} toward it, and the return fees go away` : 'Return fees go away when you stay with Toyota',
      impactValue: credit + (k.dispositionFee ?? 350) + overCost + fuelDelta * 36,
      pros: [cand.why, `${cand.seats} seats, ${cand.mpg} MPG`, 'Disposition fee waived when you lease again with Toyota', 'Mileage overage absorbed in the trade'],
      cons: [`Payment changes from ${money(k.monthlyPayment)} to ${money(monthly)}`, `Pick a ${suggestedAllowance.toLocaleString()}-mile allowance so this doesn't happen again`],
      plain: `Because your car is worth more than its buyout, that difference can go toward your next Toyota. That's free money you'd otherwise leave behind. This keeps you in a new car with warranty, sized for where your life is going.`,
      assumptions: [`36-month lease at ${lApr}% APR equivalent`, `MSRP ${money(cand.msrp)}, $0 down`, `${Math.round(ASSUMPTIONS.newLeaseResidualPct * 100)}% residual`, `Gas at $${ASSUMPTIONS.gasPrice}/gal`],
      terms: ['lease equity', 'residual value', 'money factor', 'mileage allowance'],
      nextStep: { type: 'eligible_offer', label: `Reserve a ${cand.model} test drive with loyalty pricing` },
      businessValue: { retention: 'retain', revenue: 'New lease + vehicle sale', serviceEffort: 'Dealer appointment pre-filled' },
      score: 0,
    });
  }
  void answers;
}

function buildLoanOptions(
  c: CustomerProfile,
  answers: Answers,
  milesPerYear: number,
  situation: Record<string, string | number>,
  options: MoveOption[],
) {
  const k = c.contract;
  const remainingPaid = k.monthlyPayment * k.monthsRemaining;
  const interestLeft = Math.max(0, Math.round(remainingPaid - k.payoffAmount));
  const equity = c.vehicle.estMarketValue - k.payoffAmount;
  const band: CreditBand | undefined = answers.creditBand;
  const newApr = BAND_APR[band ?? 'good'];
  Object.assign(situation, { payoffAmount: k.payoffAmount, apr: k.apr, interestLeft, equity });

  // Keep as-is
  options.push({
    id: 'keep',
    kind: 'keep',
    title: 'Keep things as they are',
    headline: `Keep paying ${money(k.monthlyPayment)} for ${k.monthsRemaining} more months.`,
    monthlyPayment: k.monthlyPayment,
    upfrontCost: 0,
    impactLabel: `About ${money(interestLeft)} in interest still to pay`,
    impactValue: 0,
    pros: ['Nothing to sign', 'You own it outright in ' + Math.ceil(k.monthsRemaining / 12) + ' years'],
    cons: [`You keep paying ${k.apr}% APR`],
    plain: `Doing nothing is always an option. You'd pay about ${money(interestLeft)} more in interest before the car is fully yours.`,
    assumptions: ['Payments made on time'],
    terms: ['apr', 'payoff amount'],
    nextStep: { type: 'self_service', label: 'Turn on autopay' },
    businessValue: { retention: 'neutral', revenue: null, serviceEffort: 'None' },
    score: 0,
  });

  // Refinance
  // Only offer a refinance once they've told us roughly where their credit is now.
  if (band && k.apr - newApr >= 1) {
    const newPay = Math.round(amortize(k.payoffAmount, newApr, k.monthsRemaining));
    const savings = Math.round((k.monthlyPayment - newPay) * k.monthsRemaining);
    options.push({
      id: 'refinance',
      kind: 'refinance',
      title: 'Lower your interest rate',
      headline: `With ${band} credit you may qualify for about ${newApr}% instead of ${k.apr}%. That could drop your payment to about ${money(newPay)}, saving roughly ${money(savings)}.`,
      monthlyPayment: newPay,
      upfrontCost: 0,
      impactLabel: `Saves about ${money(savings)} over the loan`,
      impactValue: savings,
      pros: [`${money(k.monthlyPayment - newPay)} less every month`, 'Same end date, no extra years added', 'Rewarding you for improving your credit'],
      cons: ['Requires a credit check', 'Rate is an estimate until approved'],
      plain: `Your interest rate, called APR, was locked in at ${k.apr}% when you got the loan. With ${band} credit now, lenders see you as lower risk. Refinancing replaces your old loan with a new one at today's better rate.`,
      assumptions: [`Estimated ${newApr}% APR for ${band} credit`, `Same ${k.monthsRemaining}-month remaining term`, `Payoff ${money(k.payoffAmount)}`],
      terms: ['refinance', 'apr', 'credit score', 'payoff amount'],
      nextStep: { type: 'eligible_offer', label: 'Check your Toyota refinance rate (soft pull)' },
      businessValue: { retention: 'retain', revenue: 'Keeps the loan at TFS instead of an outside credit union', serviceEffort: 'Self-service application' },
      score: 0,
    });
  }

  // Pay extra
  const extra = 100;
  const sched = payoffSchedule(k.payoffAmount, k.apr, k.monthlyPayment + extra);
  const base = payoffSchedule(k.payoffAmount, k.apr, k.monthlyPayment);
  const monthsSaved = Math.max(0, base.months - sched.months);
  const interestSaved = Math.round(base.interest - sched.interest);
  if (monthsSaved > 0) {
    options.push({
      id: 'pay_extra',
      kind: 'pay_extra',
      title: `Pay it off sooner`,
      headline: `Adding ${money(extra)} a month finishes about ${monthsSaved} months early and saves around ${money(interestSaved)} in interest.`,
      monthlyPayment: k.monthlyPayment + extra,
      upfrontCost: 0,
      impactLabel: `Done ${monthsSaved} months early and saves about ${money(interestSaved)}`,
      impactValue: interestSaved,
      pros: ['No credit check', 'Stop anytime'],
      cons: [`${money(extra)} more each month`],
      plain: 'Every extra dollar goes straight to the principal, which is the amount you actually borrowed. That means less interest piles up afterward.',
      assumptions: [`Extra ${money(extra)}/month applied to principal`, `Current ${k.apr}% APR`],
      terms: ['principal', 'apr'],
      nextStep: { type: 'self_service', label: 'Set up a recurring extra principal payment' },
      businessValue: { retention: 'neutral', revenue: null, serviceEffort: 'Self-service' },
      score: 0,
    });
  }

  // Trade + upgrade
  for (const cand of upgradeCandidates(c, answers)) {
    const buy = calculatePurchase({
      price: cand.msrp - Math.min(0, equity) /* negative equity rolls in */, downPayment: 0, apr: newApr,
      termMonths: ASSUMPTIONS.newLoanTerm, isLease: false, isSubscription: false,
      tradeInValue: Math.max(0, equity), taxRate: ASSUMPTIONS.taxRate,
    });
    const fuelDelta = Math.round(fuelMonthly(milesPerYear, c.vehicle.mpg) - fuelMonthly(milesPerYear, cand.mpg));
    options.push({
      id: `upgrade-${slug(cand.model)}`,
      kind: 'upgrade',
      title: `Trade up to a ${cand.model}`,
      headline: `Your ${money(equity)} of equity goes toward a ${cand.model}. Payment about ${money(buy.monthlyPayment)}, but you'd save about ${money(fuelDelta)} a month on gas.`,
      monthlyPayment: buy.monthlyPayment,
      upfrontCost: 0,
      impactLabel: fuelDelta > 0 ? `Saves about ${money(fuelDelta)} a month on gas, and your ${c.vehicle.model} gives you ${money(equity)} toward it` : `Your ${c.vehicle.model} gives you ${money(equity)} toward it`,
      impactValue: fuelDelta * 60 - (buy.monthlyPayment - k.monthlyPayment) * Math.min(60, k.monthsRemaining),
      pros: [cand.why, `${cand.mpg} MPG vs. your ${c.vehicle.mpg}`, equity > 0 ? `${money(equity)} trade-in equity` : 'New warranty'],
      cons: [`New ${ASSUMPTIONS.newLoanTerm}-month loan`, `Payment changes from ${money(k.monthlyPayment)} to ${money(buy.monthlyPayment)}`],
      plain: `Equity is what your truck is worth minus what you still owe. You have about ${money(equity)}, and that works like a down payment on the next one. At ${Math.round(milesPerYear).toLocaleString()} miles a year, fuel is a real monthly bill, so we count it.`,
      assumptions: [`MSRP ${money(cand.msrp)}`, `${newApr}% APR, 60 months`, `${Math.round(milesPerYear).toLocaleString()} miles/yr, gas $${ASSUMPTIONS.gasPrice}/gal`, `Trade value ${money(c.vehicle.estMarketValue)}`],
      terms: ['equity', 'trade-in', 'apr'],
      nextStep: { type: 'eligible_offer', label: `Get a firm trade-in offer and test drive the ${cand.model}` },
      businessValue: { retention: 'retain', revenue: 'New vehicle sale + new TFS loan', serviceEffort: 'Dealer appointment pre-filled' },
      score: 0,
    });
  }
  void answers;
}

/**
 * What they could move into, from what they told us on the call:
 * the model they named, more seats if the family is growing, the same kind of
 * vehicle if they need it (a truck stays a truck), otherwise the newest version
 * of their car plus a more efficient choice.
 */
function upgradeCandidates(c: CustomerProfile, a: Answers): Array<{ model: string; msrp: number; fuelType: string; mpg: number; seats: number; why: string }> {
  const fromCatalog = (name: string, why: string) => {
    const m = CATALOG.find((x) => x.model === name);
    return m ? { model: m.model, msrp: m.msrp, fuelType: m.mpg > 35 ? 'Hybrid' : 'Gas', mpg: m.mpg, seats: m.seats, why } : null;
  };
  const out: Array<ReturnType<typeof fromCatalog>> = [];
  const named = findModel(a.vehicleInterest);
  if (named) out.push(fromCatalog(named.model, 'The one you asked about'));
  if (a.needsMoreSpace) out.push(fromCatalog('Grand Highlander', 'Three rows for a growing family'), fromCatalog('Sienna', 'Eight seats and sliding doors'));
  const base = c.vehicle.model.split(' ')[0];
  const same = CATALOG.find((x) => x.model.startsWith(base));
  if (a.needsSameVehicleType && same) out.push(fromCatalog(same.model, `A newer ${same.model}, so you keep what works`));
  if (!out.length) {
    if (same) out.push(fromCatalog(same.model, `The newest ${same.model}`));
    out.push(fromCatalog(same?.kind === 'truck' ? 'Tundra' : 'Camry', same?.kind === 'truck' ? 'More truck, same brand' : 'A hybrid that roughly doubles typical MPG'));
  }
  const seen = new Set<string>();
  return out.filter((x): x is NonNullable<typeof x> => !!x && !seen.has(x.model) && !!seen.add(x.model)).slice(0, 2);
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** Compact text the voice agent reads from. Keeps tool responses short so speech stays fast. */
export function spokenBrief(_c: CustomerProfile, r: NextMoveResult): string {
  const top = r.options.slice(0, 3).map((o, i) => {
    const pay = o.monthlyPayment !== null ? ` Monthly about ${money(o.monthlyPayment)}.` : '';
    return `${i + 1}. [${o.id}] ${o.title}.${pay} ${o.impactLabel}.${o.overBudget ? ' OVER their budget.' : ''}${o.requiresHuman ? ' REQUIRES HUMAN: call request_human.' : ''}`;
  });
  return [
    `Recommended: ${r.recommendedId}.`,
    ...top,
    r.notes.length ? `Also mention: ${r.notes.join(' ')}` : '',
    'Explain the recommended option first in one or two sentences, then offer the others briefly. Use only these numbers.',
  ]
    .filter(Boolean)
    .join('\n');
}


// ---------------------------------------------------------------------------
// New customers: no account yet, so options come from what they told us.
// ---------------------------------------------------------------------------

/** Synthetic starting prices for the demo (not real Toyota pricing). */
export const CATALOG: Array<{ model: string; msrp: number; seats: number; mpg: number; kind: string }> = [
  { model: 'Corolla', msrp: 23500, seats: 5, mpg: 35, kind: 'sedan' },
  { model: 'Corolla Cross', msrp: 25500, seats: 5, mpg: 32, kind: 'suv' },
  { model: 'Prius', msrp: 29000, seats: 5, mpg: 57, kind: 'sedan' },
  { model: 'Camry', msrp: 29500, seats: 5, mpg: 51, kind: 'sedan' },
  { model: 'GR86', msrp: 30500, seats: 4, mpg: 25, kind: 'sports' },
  { model: 'RAV4', msrp: 31500, seats: 5, mpg: 30, kind: 'suv' },
  { model: 'RAV4 Hybrid', msrp: 33500, seats: 5, mpg: 39, kind: 'suv' },
  { model: 'Tacoma', msrp: 32500, seats: 5, mpg: 21, kind: 'truck' },
  { model: 'bZ4X', msrp: 38000, seats: 5, mpg: 104, kind: 'suv' },
  { model: 'Sienna', msrp: 40000, seats: 8, mpg: 36, kind: 'van' },
  { model: 'Highlander', msrp: 41000, seats: 8, mpg: 24, kind: 'suv' },
  { model: '4Runner', msrp: 42000, seats: 5, mpg: 19, kind: 'suv' },
  { model: 'Tundra', msrp: 42000, seats: 5, mpg: 20, kind: 'truck' },
  { model: 'Grand Highlander', msrp: 44000, seats: 8, mpg: 24, kind: 'suv' },
  { model: 'Supra', msrp: 47000, seats: 2, mpg: 26, kind: 'sports' },
];

export function findModel(q?: string) {
  const s = (q || '').toLowerCase();
  if (!s) return undefined;
  return [...CATALOG].sort((a, b) => b.model.length - a.model.length).find((m) => s.includes(m.model.toLowerCase()))
    ?? CATALOG.find((m) => m.model.toLowerCase().includes(s.split(' ')[0]));
}

const BAND_APR: Record<CreditBand, number> = { excellent: 5.4, good: 6.9, fair: 8.9, rebuilding: 11.9 };
const BAND_LEASE: Record<CreditBand, number> = { excellent: 3.9, good: 4.9, fair: 6.5, rebuilding: 8.5 };

export function computeGuestMoves(a: Answers): NextMoveResult {
  const band: CreditBand = a.creditBand ?? 'good';
  const m = findModel(a.vehicleInterest) ?? CATALOG.find((x) => x.model === 'RAV4')!;
  const down = a.downPayment ?? 0;
  const miles = a.milesPerYear ?? 12000;
  const apr = BAND_APR[band];
  const options: MoveOption[] = [];
  const notes: string[] = [];
  const situation: Record<string, string | number> = { vehicle: m.model, msrp: m.msrp, downPayment: down, creditBand: band, milesPerYear: miles };

  const buy = calculatePurchase({ price: m.msrp, downPayment: down, apr, termMonths: 60, isLease: false, isSubscription: false, tradeInValue: 0, taxRate: ASSUMPTIONS.taxRate });
  const interest = buy.totalInterest ?? Math.max(0, buy.monthlyPayment * 60 - (m.msrp - down));
  options.push({
    id: 'buy_new', kind: 'buyout', title: `Buy a new ${m.model}`,
    headline: `Finance a new ${m.model} for about ${money(buy.monthlyPayment)} a month over 5 years.`,
    monthlyPayment: buy.monthlyPayment, upfrontCost: down,
    impactLabel: `You own it after 60 payments, about ${money(interest)} in interest`, impactValue: 0,
    pros: ['It is yours at the end', 'No mileage limits', 'Build equity every month'],
    cons: ['Higher monthly payment than leasing', `About ${money(interest)} in interest over the loan`],
    plain: `You borrow the price minus your ${money(down)} down, and pay it back over 5 years at about ${apr}% APR for ${band} credit. When the payments end, the car is fully yours.`,
    assumptions: [`Starting price ${money(m.msrp)} (demo pricing)`, `${apr}% APR for ${band} credit`, `${money(down)} down`, 'TX sales tax 6.25%', '60 months'],
    terms: ['apr', 'principal', 'term'],
    nextStep: { type: 'eligible_offer', label: 'Get pre-qualified with a soft credit check' },
    businessValue: { retention: 'retain', revenue: 'New customer: vehicle sale + TFS loan', serviceEffort: 'Self-service pre-qualification' },
    score: 0,
  });

  let leasePay: number | null = null;
  try {
    leasePay = calculateLease({ price: m.msrp, downPayment: down, apr: BAND_LEASE[band], termMonths: 36, isLease: true, isSubscription: false, residualValue: Math.round(m.msrp * 0.58), tradeInValue: 0, taxRate: ASSUMPTIONS.taxRate }).monthlyPayment;
  } catch { /* lease not possible at this price */ }
  if (leasePay !== null) {
    const allowance = miles > 13000 ? 15000 : 12000;
    options.push({
      id: 'lease_new', kind: 'upgrade', title: `Lease a new ${m.model}`,
      headline: `Drive a new ${m.model} for about ${money(leasePay)} a month for 3 years.`,
      monthlyPayment: leasePay, upfrontCost: down,
      impactLabel: `About ${money(buy.monthlyPayment - leasePay)} a month less than buying`, impactValue: Math.round((buy.monthlyPayment - leasePay) * 36),
      pros: ['Lowest monthly payment', 'Always under warranty', 'Easy to switch in 3 years'],
      cons: [`Limited to ${allowance.toLocaleString()} miles a year`, 'You do not own it at the end'],
      plain: `Leasing means you pay for the part of the car you use over 3 years, not the whole car. That keeps the payment lower. At the end you can hand it back, buy it, or switch to a new one.`,
      assumptions: [`36 months, ${allowance.toLocaleString()} miles a year`, `${BAND_LEASE[band]}% APR equivalent`, '58% residual', `${money(down)} down`],
      terms: ['residual value', 'money factor', 'mileage allowance'],
      nextStep: { type: 'eligible_offer', label: `Book a ${m.model} test drive with lease pricing` },
      businessValue: { retention: 'retain', revenue: 'New customer: TFS lease', serviceEffort: 'Dealer appointment pre-filled' },
      score: 0,
    });
  }

  const cpoPrice = Math.round(m.msrp * 0.74);
  const cpo = calculatePurchase({ price: cpoPrice, downPayment: down, apr: apr + 1, termMonths: 60, isLease: false, isSubscription: false, tradeInValue: 0, taxRate: ASSUMPTIONS.taxRate });
  options.push({
    id: 'cpo', kind: 'keep', title: `Buy a certified pre-owned ${m.model}`,
    headline: `A 2 to 3 year old certified ${m.model} for about ${money(cpo.monthlyPayment)} a month.`,
    monthlyPayment: cpo.monthlyPayment, upfrontCost: down,
    impactLabel: `Saves about ${money(buy.monthlyPayment - cpo.monthlyPayment)} a month vs. new`, impactValue: Math.round((buy.monthlyPayment - cpo.monthlyPayment) * 60),
    pros: ['Much lower price', 'Toyota-inspected with a warranty', 'Someone else took the biggest drop in value'],
    cons: ['Slightly higher interest rate than new', 'Fewer color and trim choices'],
    plain: 'Certified pre-owned cars are recent Toyotas that passed a dealer inspection and come with an extra warranty. You get most of a new car for a lot less.',
    assumptions: [`About ${money(cpoPrice)}, roughly 74% of new`, `${apr + 1}% APR`, `${money(down)} down`, '60 months'],
    terms: ['apr', 'term'],
    nextStep: { type: 'eligible_offer', label: `See certified ${m.model}s near you` },
    businessValue: { retention: 'retain', revenue: 'New customer: CPO sale + TFS loan', serviceEffort: 'Self-service' },
    score: 0,
  });

  // If the budget is tight, show a lower-priced model of the same kind.
  if (a.budgetMaxMonthly && Math.min(buy.monthlyPayment, leasePay ?? Infinity) > a.budgetMaxMonthly) {
    const cheaper = CATALOG.filter((x) => x.msrp < m.msrp && (x.kind === m.kind || m.kind === 'sports')).sort((x, y) => x.msrp - y.msrp)[0] ?? CATALOG[0];
    const cb = calculatePurchase({ price: cheaper.msrp, downPayment: down, apr, termMonths: 60, isLease: false, isSubscription: false, tradeInValue: 0, taxRate: ASSUMPTIONS.taxRate });
    options.push({
      id: `budget-${slug(cheaper.model)}`, kind: 'upgrade', title: `Buy a new ${cheaper.model} instead`,
      headline: `A new ${cheaper.model} is about ${money(cb.monthlyPayment)} a month, closer to your budget.`,
      monthlyPayment: cb.monthlyPayment, upfrontCost: down,
      impactLabel: `About ${money(buy.monthlyPayment - cb.monthlyPayment)} a month less than the ${m.model}`, impactValue: Math.round((buy.monthlyPayment - cb.monthlyPayment) * 60),
      pros: [`Starts at ${money(cheaper.msrp)}`, `${cheaper.mpg} MPG`, 'Fits your budget better'],
      cons: [`Not the ${m.model} you asked about`],
      plain: `Your budget is tight for a ${m.model}. A ${cheaper.model} gives you a new Toyota with a payment that is easier to live with.`,
      assumptions: [`Starting price ${money(cheaper.msrp)} (demo pricing)`, `${apr}% APR`, `${money(down)} down`, '60 months'],
      terms: ['apr'],
      nextStep: { type: 'eligible_offer', label: `Book a ${cheaper.model} test drive` },
      businessValue: { retention: 'retain', revenue: 'New customer: vehicle sale + TFS loan', serviceEffort: 'Self-service' },
      score: 0,
    });
  }

  for (const o of options) {
    let sc = 50;
    if (a.budgetMaxMonthly && o.monthlyPayment !== null && o.monthlyPayment > a.budgetMaxMonthly) { sc -= 30; o.overBudget = true; }
    if (a.wants === 'lease' && o.id === 'lease_new') sc += 25;
    if (a.wants === 'buy' && (o.id === 'buy_new' || o.id === 'cpo')) sc += 15;
    if (a.priority === 'lowest_payment' && o.monthlyPayment !== null) sc += Math.max(0, 25 - o.monthlyPayment / 40);
    if (a.priority === 'own_it' && (o.id === 'buy_new' || o.id === 'cpo')) sc += 20;
    if (a.priority === 'newest_tech' && (o.id === 'buy_new' || o.id === 'lease_new')) sc += 20;
    if (a.priority === 'flexibility' && o.id === 'lease_new') sc += 20;
    if (o.id === 'lease_new' && miles > 18000) sc -= 20;
    if (band === 'rebuilding' && o.id === 'cpo') sc += 10;
    o.score = Math.round(sc);
  }
  options.sort((x, y) => y.score - x.score);
  options[0].recommended = true;
  if (band === 'rebuilding' || band === 'fair') notes.push('Rates shown are estimates for your credit range. A soft credit check gives your real rate without hurting your score.');
  return { situation, options, recommendedId: options[0].id, notes };
}
