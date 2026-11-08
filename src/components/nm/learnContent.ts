/**
 * Financial Literacy Center content. Example numbers are computed, not typed in,
 * so they always add up.
 */
import { amortize } from '../../lib/api';

export interface QuizQ { q: string; choices: string[]; answer: number; why: string }
export interface Topic {
  id: string;
  title: string;
  icon: string;
  tint: string; // css var for the icon tile
  definition: string;
  how: string;
  example: { title: string; lines: string[]; impact: string };
  tips: string[];
  quiz: QuizQ[];
  glossaryKeys: string[]; // terms from the voice agent that land on this topic
}

const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const total = (p: number, apr: number, m: number) => amortize(p, apr, m) * m;

// What is APR?
const aprLow = total(30000, 4, 60) - 30000;
const aprHigh = total(30000, 9, 60) - 30000;
// How interest works
const pay6 = amortize(30000, 6, 60);
const firstInterest = 30000 * 0.06 / 12;
// Down payments
const p0 = amortize(30000, 6, 60), p20 = amortize(24000, 6, 60);
const int0 = p0 * 60 - 30000, int20 = p20 * 60 - 24000;
// Loan terms
const t36 = amortize(30000, 6, 36), t60 = amortize(30000, 6, 60), t72 = amortize(30000, 6, 72);
// Credit
const c780 = total(30000, 5, 60) - 30000, c680 = total(30000, 8, 60) - 30000, c600 = total(30000, 12, 60) - 30000;
// Lease
const leaseDep = (40000 - 23200) / 36, leaseFin = (40000 + 23200) * 0.00125;
const leasePay = leaseDep + leaseFin;
const buyPay = amortize(40000, 6, 60);

export const topics: Topic[] = [
  {
    id: 'apr', title: 'What is APR?', icon: 'percent', tint: 'var(--nm-blue-soft)',
    definition: 'APR (Annual Percentage Rate) is the yearly cost of borrowing money, including interest and some lender fees, shown as a percentage.',
    how: 'Your APR decides how much extra you pay on top of the car price. It is set mostly by your credit score, the loan length, and whether the car is new or used.',
    example: {
      title: '$30,000 loan over 5 years',
      lines: [`At 4% APR: ${$(amortize(30000, 4, 60))}/mo, ${$(aprLow)} total interest`, `At 9% APR: ${$(amortize(30000, 9, 60))}/mo, ${$(aprHigh)} total interest`],
      impact: `Impact: 5 points of APR costs ${$(aprHigh - aprLow)} more for the exact same car`,
    },
    tips: ['Compare APR, not just the monthly payment', 'Get pre-approved so you know your rate before the dealer', 'Your rate can drop later. Refinance if your credit improves'],
    quiz: [
      { q: 'What does APR measure?', choices: ['The car\'s sticker price', 'The yearly cost of borrowing', 'Your monthly insurance', 'The trade-in value'], answer: 1, why: 'APR is the annual price of borrowing, including interest and some fees.' },
      { q: 'Which usually lowers your APR the most?', choices: ['A higher credit score', 'A brighter paint color', 'A longer loan', 'Skipping a down payment'], answer: 0, why: 'Lenders price risk. A higher score means a lower rate.' },
      { q: 'Same car, same term: 4% vs 9% APR. What changes?', choices: ['Nothing', 'Only the down payment', 'Thousands in total interest', 'The car\'s value'], answer: 2, why: `On $30,000 over 5 years the gap is about ${$(aprHigh - aprLow)}.` },
    ],
    glossaryKeys: ['apr', 'money factor'],
  },
  {
    id: 'interest', title: 'How Interest Works', icon: 'trend', tint: 'var(--nm-mint-soft)',
    definition: 'Interest is what the lender charges you for using their money. On a car loan it is charged each month on the balance you still owe.',
    how: 'Early payments are mostly interest because your balance is high. As the balance shrinks, more of each payment goes to principal, the amount you actually borrowed.',
    example: {
      title: '$30,000 at 6% for 60 months',
      lines: [`Monthly payment: ${$(pay6)}`, `Month 1: ${$(firstInterest)} interest, ${$(pay6 - firstInterest)} principal`, `Total interest over the loan: ${$(pay6 * 60 - 30000)}`],
      impact: 'Impact: Extra payments early in the loan save the most interest',
    },
    tips: ['Extra payments should go to principal. Tell your lender', 'Paying a few days early can trim interest on simple-interest loans', 'Avoid stretching the loan just to lower the payment'],
    quiz: [
      { q: 'Early in a loan, most of your payment goes to…', choices: ['Principal', 'Interest', 'Insurance', 'Taxes'], answer: 1, why: 'Interest is charged on the balance, which is highest at the start.' },
      { q: 'What is principal?', choices: ['The amount you borrowed', 'The dealer\'s profit', 'The monthly fee', 'The interest rate'], answer: 0, why: 'Principal is the borrowed amount, not counting interest.' },
      { q: 'Best time to make an extra payment to save interest?', choices: ['Last month', 'Never', 'Early in the loan', 'It doesn\'t matter'], answer: 2, why: 'Lowering the balance early stops interest from building on it.' },
    ],
    glossaryKeys: ['principal'],
  },
  {
    id: 'down', title: 'Down Payments', icon: 'dollar', tint: 'var(--nm-purple-soft)',
    definition: 'A down payment is the cash (or trade-in equity) you pay upfront so you borrow less.',
    how: 'Every dollar down is a dollar you don\'t pay interest on. A bigger down payment also protects you from owing more than the car is worth.',
    example: {
      title: '$30,000 car, 6% APR, 60 months',
      lines: [`$0 down: ${$(p0)}/mo, ${$(int0)} interest`, `$6,000 down (20%): ${$(p20)}/mo, ${$(int20)} interest`],
      impact: `Impact: 20% down saves ${$(p0 - p20)} a month and ${$(int0 - int20)} in interest`,
    },
    tips: ['Aim for 20% down on a purchase', 'Trade-in equity counts as a down payment', 'On a lease, a big down payment can be lost if the car is totaled'],
    quiz: [
      { q: 'A bigger down payment means…', choices: ['A bigger loan', 'Less interest paid', 'A higher APR', 'A longer term'], answer: 1, why: 'You borrow less, so less interest builds up.' },
      { q: 'Can trade-in equity act as a down payment?', choices: ['Yes', 'No'], answer: 0, why: 'Equity in your current car reduces what you borrow.' },
      { q: 'Common guideline for a purchase down payment?', choices: ['0%', '5%', '20%', '50%'], answer: 2, why: '20% keeps payments manageable and avoids negative equity.' },
    ],
    glossaryKeys: ['equity', 'trade-in', 'negative equity'],
  },
  {
    id: 'terms', title: 'Loan Terms', icon: 'calendar', tint: 'var(--nm-peach-soft)',
    definition: 'The loan term is how many months you have to pay it back, usually 36 to 72.',
    how: 'Longer terms lower the monthly payment but you pay interest for more months, and you can end up owing more than the car is worth.',
    example: {
      title: '$30,000 at 6% APR',
      lines: [`36 months: ${$(t36)}/mo, ${$(t36 * 36 - 30000)} interest`, `60 months: ${$(t60)}/mo, ${$(t60 * 60 - 30000)} interest`, `72 months: ${$(t72)}/mo, ${$(t72 * 72 - 30000)} interest`],
      impact: `Impact: 72 months costs ${$(t72 * 72 - t36 * 36)} more than 36 months`,
    },
    tips: ['Choose the shortest term you can comfortably afford', 'Longer terms often come with higher APRs', 'Watch out for 84-month loans'],
    quiz: [
      { q: 'A longer loan term usually means…', choices: ['Lower payment, more interest', 'Higher payment, less interest', 'No change', 'Lower price'], answer: 0, why: 'Spreading payments out costs more interest overall.' },
      { q: 'Which term usually saves the most money?', choices: ['84 months', '72 months', '36 months'], answer: 2, why: 'Fewer months of interest.' },
      { q: 'Long terms increase the risk of…', choices: ['Negative equity', 'Lower insurance', 'Free maintenance'], answer: 0, why: 'You can owe more than the car is worth for longer.' },
    ],
    glossaryKeys: ['term', 'payment extension', 'due date change'],
  },
  {
    id: 'credit', title: 'Credit Scores & Financing', icon: 'card', tint: 'var(--nm-pink-soft)',
    definition: 'A credit score (300 to 850) tells lenders how reliably you repay. It is the biggest factor in your APR.',
    how: 'On-time payments, low credit card balances, and a long history raise your score. A higher score unlocks lower rates. If your score rises after you buy, you can refinance.',
    example: {
      title: '$30,000 over 60 months',
      lines: [`780 score at about 5%: ${$(c780)} interest`, `680 score at about 8%: ${$(c680)} interest`, `600 score at about 12%: ${$(c600)} interest`],
      impact: `Impact: Good credit can save ${$(c600 - c780)} on the same car`,
    },
    tips: ['Pay every bill on time. It\'s the biggest factor', 'Keep credit card use under 30% of the limit', 'Score jumped since you bought? Ask about refinancing'],
    quiz: [
      { q: 'Biggest factor in most credit scores?', choices: ['Income', 'Payment history', 'Car brand', 'Age'], answer: 1, why: 'Paying on time matters most.' },
      { q: 'Your score went up 100 points since your loan. You should…', choices: ['Do nothing', 'Check refinancing', 'Pay a late fee'], answer: 1, why: 'A better score can qualify you for a lower rate now.' },
      { q: 'Credit card utilization should stay under…', choices: ['90%', '60%', '30%'], answer: 2, why: 'Lower utilization helps your score.' },
    ],
    glossaryKeys: ['credit score', 'refinance', 'payoff amount'],
  },
  {
    id: 'lease', title: 'Leasing vs. Buying', icon: 'key', tint: 'var(--nm-blue-soft)',
    definition: 'Leasing is paying to use a car for a set time and miles. Buying is paying to own it.',
    how: 'A lease payment covers the car\'s expected drop in value (price minus residual) plus a finance charge. At the end you return it, buy it for the residual, or trade into a new one.',
    example: {
      title: '$40,000 car, 36 months',
      lines: [`Lease (58% residual, 0.00125 money factor): about ${$(leasePay)}/mo`, `Buy (6% APR, 60 months): about ${$(buyPay)}/mo`, 'Lease: lower payment, mileage limits, no ownership', 'Buy: higher payment, you own it at the end'],
      impact: `Impact: Leasing saves ${$(buyPay - leasePay)}/mo now, but you own nothing at the end`,
    },
    tips: ['Pick a mileage allowance that matches real driving', 'If your car is worth more than the residual, you have lease equity', 'Toyota often waives the return fee if you lease again'],
    quiz: [
      { q: 'What is the residual value?', choices: ['Your down payment', 'The predicted value at lease end', 'The monthly fee'], answer: 1, why: 'It is also your buyout price.' },
      { q: 'Money factor 0.00125 is about what APR?', choices: ['0.125%', '3%', '12.5%'], answer: 1, why: 'Multiply by 2,400: 0.00125 × 2400 = 3%.' },
      { q: 'Your car is worth more than its buyout price. That gap is…', choices: ['Lease equity', 'A penalty', 'Depreciation'], answer: 0, why: 'You can use it toward your next car instead of leaving it behind.' },
    ],
    glossaryKeys: ['residual value', 'money factor', 'buyout', 'lease equity', 'mileage allowance', 'excess mileage', 'disposition fee'],
  },
  {
    id: 'tco', title: 'Total Cost of Ownership', icon: 'calc', tint: 'var(--nm-purple-soft)',
    definition: 'Total cost includes the purchase price, interest, taxes, fees, insurance, maintenance, and fuel.',
    how: 'The sticker price is just the beginning. Consider all costs over the life of the vehicle to make an informed decision.',
    example: {
      title: '$30,000 car over 5 years',
      lines: ['Purchase: $30,000', `Interest (5% APR): ${$(total(30000, 5, 60) - 30000)}`, 'Taxes & Fees: $2,400', 'Insurance: $6,000', 'Maintenance: $3,000', 'Fuel (15k mi/yr): $7,500'],
      impact: (() => {
        const t = 30000 + (total(30000, 5, 60) - 30000) + 2400 + 6000 + 3000 + 7500;
        return `Impact: Total 5-year cost: ${$(t)} - that's ${Math.round((t / 30000 - 1) * 100)}% more than the sticker price`;
      })(),
    },
    tips: ['Factor in insurance costs - sports cars and luxury vehicles cost more', 'Consider fuel economy - hybrids can save thousands in fuel costs', 'Budget for maintenance - typically $500-1,000 per year', 'Research reliability ratings - repairs can add thousands', 'Consider resale value - some brands hold value better than others'],
    quiz: [
      { q: 'Which is NOT part of total cost of ownership?', choices: ['Fuel', 'Insurance', 'The dealership\'s rent', 'Maintenance'], answer: 2, why: 'TCO is what you pay: price, interest, taxes, insurance, maintenance, fuel.' },
      { q: 'In the example, the 5-year cost is about how much more than sticker?', choices: ['10%', '35%', '76%'], answer: 2, why: 'All costs add up to about 76% more than the price.' },
      { q: 'Driving 30,000 miles a year makes which car choice matter more?', choices: ['Paint color', 'Fuel economy', 'Floor mats'], answer: 1, why: 'Fuel becomes one of the biggest monthly costs.' },
    ],
    glossaryKeys: [],
  },
];

export function topicForTerm(key: string): Topic | undefined {
  return topics.find((t) => t.glossaryKeys.includes(key));
}
