/**
 * Plain-language glossary used by the voice agent's explain_term tool
 * and shown on screen in "What you learned during this call".
 * Merge point for the existing Learn section: same keys, same tone.
 */

export interface Term {
  key: string;
  term: string;
  short: string; // one sentence, safe to speak aloud
  analogy: string; // everyday comparison
  whyItMatters: string;
}

export const glossary: Term[] = [
  { key: 'apr', term: 'APR', short: 'APR is the yearly price of borrowing money, shown as a percentage.', analogy: "It's like rent on the money you borrowed. A lower APR means cheaper rent.", whyItMatters: 'A few points of APR can mean thousands of dollars over a loan.' },
  { key: 'residual value', term: 'Residual value', short: "Residual value is what the leasing company predicted your car would be worth at the end of the lease. It's also your buyout price.", analogy: "It's like a price tag written on the car the day you leased it.", whyItMatters: "If the car is now worth more than the residual, buying it out is like getting a discount." },
  { key: 'buyout', term: 'Lease buyout', short: 'A buyout means purchasing your leased car for the residual price set in your contract.', analogy: 'Like renting an apartment with the option to buy it at a price agreed years ago.', whyItMatters: 'It can beat the used-car market, and mileage overage fees go away.' },
  { key: 'lease equity', term: 'Lease equity', short: "Lease equity is the gap between what your car is worth today and your buyout price, when the car is worth more.", analogy: "It's like finding out the house you rent is worth more than the price you locked in.", whyItMatters: 'You can use it as credit toward your next car instead of leaving it behind.' },
  { key: 'equity', term: 'Equity', short: 'Equity is what your car is worth minus what you still owe on it.', analogy: "It's the part of the car that's truly yours.", whyItMatters: 'Positive equity acts like a down payment on your next vehicle.' },
  { key: 'negative equity', term: 'Negative equity', short: 'Negative equity means you owe more than the car is worth.', analogy: 'Like owing $10 on a gift card that only holds $8.', whyItMatters: 'Rolling it into a new loan makes the new loan bigger.' },
  { key: 'disposition fee', term: 'Disposition fee', short: 'A disposition fee is a charge for returning a leased car at the end of the lease.', analogy: 'Like a cleaning fee when you move out.', whyItMatters: 'Toyota usually waives it if you lease or buy another Toyota.' },
  { key: 'excess mileage', term: 'Excess mileage', short: 'Excess mileage is any distance driven above your lease allowance, billed per mile.', analogy: 'Like going over your phone data plan.', whyItMatters: 'At 25 cents a mile, 3,000 extra miles is $750.' },
  { key: 'mileage allowance', term: 'Mileage allowance', short: 'Your mileage allowance is how many miles per year the lease lets you drive without extra fees.', analogy: 'Your data plan size.', whyItMatters: 'Pick one that matches how you really drive so there are no surprises.' },
  { key: 'money factor', term: 'Money factor', short: "The money factor is a lease's interest rate written as a tiny decimal. Multiply it by 2,400 to get an APR.", analogy: "It's APR wearing a disguise.", whyItMatters: 'Always convert it so you can compare it to a loan.' },
  { key: 'payoff amount', term: 'Payoff amount', short: 'The payoff amount is what you would pay today to own the car outright and close the loan.', analogy: 'The final bill to settle up.', whyItMatters: "It's the number used for refinancing and trade-ins." },
  { key: 'refinance', term: 'Refinancing', short: 'Refinancing replaces your current loan with a new one, usually at a better rate.', analogy: 'Like switching to a cheaper phone plan without changing phones.', whyItMatters: 'If your credit improved, you may be overpaying every month.' },
  { key: 'credit score', term: 'Credit score', short: 'A credit score is a number from 300 to 850 that tells lenders how reliably you repay.', analogy: 'A report card for borrowing.', whyItMatters: 'A higher score unlocks lower rates.' },
  { key: 'principal', term: 'Principal', short: 'Principal is the amount you actually borrowed, not counting interest.', analogy: 'The price of the pizza before delivery fees.', whyItMatters: 'Extra payments to principal shrink the interest you owe later.' },
  { key: 'trade-in', term: 'Trade-in', short: 'A trade-in is selling your current car to the dealer as part of getting a new one.', analogy: 'Like trading in an old phone toward a new one.', whyItMatters: 'Your equity becomes credit on the new deal.' },
  { key: 'payment extension', term: 'Payment extension', short: 'A payment extension moves one or more payments to the end of the loan when money is tight.', analogy: 'Hitting pause, then adding the paused months to the end.', whyItMatters: 'It can protect your credit, but interest still adds up, so a specialist reviews it.' },
  { key: 'due date change', term: 'Due date change', short: 'A due date change moves your monthly payment to a day that lines up with your paycheck.', analogy: 'Rescheduling a bill to land after payday.', whyItMatters: 'It prevents late payments without changing how much you owe.' },
  { key: 'term', term: 'Loan term', short: 'The term is how many months you have to pay off the loan.', analogy: 'The length of the payment plan.', whyItMatters: 'Longer terms lower the payment but raise total interest.' },
];

export function findTerm(query: string): Term | undefined {
  const q = query.toLowerCase().trim();
  return (
    glossary.find((t) => t.key === q || t.term.toLowerCase() === q) ??
    glossary.find((t) => q.includes(t.key) || t.key.includes(q)) ??
    glossary.find((t) => t.term.toLowerCase().includes(q))
  );
}
