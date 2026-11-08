/**
 * Synthetic Toyota Financial Services customers.
 * All data is fake. It exists so the agent has a realistic account to reason about.
 */

export type ContractType = 'lease' | 'loan';

export interface CustomerProfile {
  id: string;
  code: string; // customer code they say on the call, e.g. TM-4821
  firstName: string;
  lastName: string;
  city: string;
  avatar: string; // emoji for the demo picker
  vehicle: {
    year: number;
    model: string;
    trim: string;
    color: string;
    vinLast6: string;
    odometer: number;
    estMarketValue: number; // synthetic appraisal (think KBB / Toyota appraisal tool)
    fuelType: 'Gas' | 'Hybrid' | 'Plug-in Hybrid' | 'Electric';
    mpg: number;
  };
  contract: {
    type: ContractType;
    startDate: string;
    termMonths: number;
    monthsRemaining: number;
    monthlyPayment: number;
    apr: number; // for leases this is the APR equivalent of the money factor
    payoffAmount: number; // loan payoff, or lease buyout before fees
    residualValue?: number; // leases only
    mileageAllowancePerYear?: number; // leases only
    excessMileFee?: number; // $ per mile, leases only
    dispositionFee?: number; // leases only
    purchaseOptionFee?: number; // leases only
  };
  service: {
    toyotaCareMonthsLeft: number;
    nextServiceDueMiles: number;
    openRecalls: number;
  };
}

export const customers: CustomerProfile[] = [
  {
    id: 'maya',
    code: 'TM-4821',
    firstName: 'Maya',
    lastName: 'Chen',
    city: 'Plano, TX',
    avatar: '👩🏻‍💼',
    vehicle: {
      year: 2023,
      model: 'RAV4 Hybrid',
      trim: 'XLE',
      color: 'Blueprint',
      vinLast6: '418273',
      odometer: 38900,
      estMarketValue: 29800,
      fuelType: 'Hybrid',
      mpg: 39,
    },
    contract: {
      type: 'lease',
      startDate: '2023-03-15',
      termMonths: 36,
      monthsRemaining: 4,
      monthlyPayment: 389,
      apr: 3.9,
      payoffAmount: 25750,
      residualValue: 25750,
      mileageAllowancePerYear: 12000,
      excessMileFee: 0.25,
      dispositionFee: 350,
      purchaseOptionFee: 300,
    },
    service: { toyotaCareMonthsLeft: 0, nextServiceDueMiles: 40000, openRecalls: 0 },
  },
  {
    id: 'marcus',
    code: 'TM-7390',
    firstName: 'Marcus',
    lastName: 'Johnson',
    city: 'Richardson, TX',
    avatar: '👨🏾',
    vehicle: {
      year: 2023,
      model: 'Camry',
      trim: 'SE',
      color: 'Wind Chill Pearl',
      vinLast6: '902114',
      odometer: 31200,
      estMarketValue: 23400,
      fuelType: 'Gas',
      mpg: 32,
    },
    contract: {
      type: 'loan',
      startDate: '2024-09-01',
      termMonths: 72,
      monthsRemaining: 46,
      monthlyPayment: 512,
      apr: 8.9,
      payoffAmount: 19850,
    },
    service: { toyotaCareMonthsLeft: 0, nextServiceDueMiles: 35000, openRecalls: 1 },
  },
  {
    id: 'priya',
    code: 'TM-2654',
    firstName: 'Priya',
    lastName: 'Patel',
    city: 'Garland, TX',
    avatar: '👩🏽',
    vehicle: {
      year: 2024,
      model: 'Corolla',
      trim: 'LE',
      color: 'Celestite',
      vinLast6: '550781',
      odometer: 18700,
      estMarketValue: 19600,
      fuelType: 'Gas',
      mpg: 35,
    },
    contract: {
      type: 'loan',
      startDate: '2024-11-20',
      termMonths: 60,
      monthsRemaining: 37,
      monthlyPayment: 398,
      apr: 6.4,
      payoffAmount: 13330,
    },
    service: { toyotaCareMonthsLeft: 1, nextServiceDueMiles: 20000, openRecalls: 0 },
  },
  {
    id: 'diego',
    code: 'TM-9017',
    firstName: 'Diego',
    lastName: 'Ramirez',
    city: 'Frisco, TX',
    avatar: '👨🏻',
    vehicle: {
      year: 2024,
      model: 'Tacoma',
      trim: 'TRD Sport',
      color: 'Ice Cap',
      vinLast6: '774092',
      odometer: 29400,
      estMarketValue: 38900,
      fuelType: 'Gas',
      mpg: 21,
    },
    contract: {
      type: 'loan',
      startDate: '2025-05-10',
      termMonths: 60,
      monthsRemaining: 42,
      monthlyPayment: 689,
      apr: 5.9,
      payoffAmount: 26100,
    },
    service: { toyotaCareMonthsLeft: 6, nextServiceDueMiles: 30000, openRecalls: 0 },
  },
];

/** Miles a year, read from the odometer and how long they've had the car (vehicle data, not a guess). */
export function observedMilesPerYear(c: CustomerProfile): number {
  const months = Math.max(1, c.contract.termMonths - c.contract.monthsRemaining);
  return Math.round((c.vehicle.odometer / months) * 12 / 100) * 100;
}

export function getCustomer(id: string): CustomerProfile | undefined {
  return customers.find((c) => c.id === id);
}

/** Short spoken-style summary the voice agent gets as context. */
export function contractSummary(c: CustomerProfile): string {
  const v = `${c.vehicle.year} ${c.vehicle.model} ${c.vehicle.trim}`;
  if (c.contract.type === 'lease') {
    return `${v} lease, $${c.contract.monthlyPayment}/month, ${c.contract.monthsRemaining} months left, ${c.vehicle.odometer.toLocaleString()} miles on it.`;
  }
  return `${v} loan at ${c.contract.apr}% APR, $${c.contract.monthlyPayment}/month, ${c.contract.monthsRemaining} payments left, payoff about $${c.contract.payoffAmount.toLocaleString()}.`;
}
