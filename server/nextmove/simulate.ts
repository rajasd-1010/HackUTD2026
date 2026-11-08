/**
 * Scripted call that drives the exact same tool handlers as a live call.
 * Used to rehearse the demo without spending call minutes, and as a backup
 * if the venue network or phone line fails during judging.
 */

import { addLine, setStatus, type Session } from './store.js';
import { toolIdentify, toolSnapshot, toolRecordAnswer, toolGetOptions, toolExplainTerm, toolRequestHuman, toolFinalize, type AnswerParams } from './tools.js';
import { customers } from './customers.js';

type Step =
  | { agent: string }
  | { customer: string; record?: AnswerParams }
  | { tool: 'options' }
  | { tool: 'term'; term: string }
  | { tool: 'human'; reason: string }
  | { tool: 'finalize'; option?: string };

const scripts: Record<string, (first: string) => Step[]> = {
  maya: (n) => [
    { agent: `Hi ${n}, this is Toyota Financial Services' AI assistant. This is an automated call, and you can ask for a person anytime. Your RAV4 lease ends in about four months, and I'd love to help you plan. Got two minutes?` },
    { customer: "Yeah, sure. Honestly I've been dreading it, we're having a baby in the spring." },
    { customer: 'And I drive a lot more than I thought, my new job is in Fort Worth.', record: { life_change: 'Baby on the way, new job in Fort Worth', needs_more_space: true, miles_per_year: 15000 } },
    { agent: 'Congratulations! What matters most for the next car, keeping the payment low, owning it, or something else?' },
    { customer: "I want room for a car seat and the stroller. I could do maybe 750 a month, not more.", record: { budget_max_monthly: 750, priority: 'newest_tech', customer_quote: 'I could do maybe 750 a month, not more.' } },
    { tool: 'options' },
    { agent: 'Good news: your RAV4 is worth about three thousand dollars more than your buyout price. You can put that toward a Grand Highlander with three rows, and the mileage fees and return fee go away.' },
    { customer: "Wait, what's a buyout price? Like a residual?" },
    { tool: 'term', term: 'residual value' },
    { agent: "Exactly. The residual is the price written into your lease back in 2023. Your car is worth more than that today, so that gap, your lease equity, is basically money you'd leave on the table by just returning it." },
    { tool: 'term', term: 'lease equity' },
    { customer: "Oh nice. Okay, the Grand Highlander one sounds right. Can I see it this weekend?" },
    { tool: 'finalize', option: 'upgrade-grand-highlander' },
    { agent: `Done. I texted you a recap with the numbers and a link to book the test drive. Congrats again, ${n}!` },
  ],
  marcus: (n) => [
    { agent: `Hi ${n}, this is Toyota Financial Services' AI assistant. This is an automated call. Do you have a quick minute to talk about your Camry loan?` },
    { customer: "Uh, okay. Am I behind on something?" },
    { agent: "Not at all. I just want to make sure your loan still fits your life. Is the monthly payment comfortable right now?" },
    { customer: "It's fine, but honestly 512 a month stings. Anything lower would help.", record: { priority: 'lowest_payment', financial_stress: false, customer_quote: "512 a month stings. Anything lower would help." } },
    { agent: 'Got it. Roughly how is your credit these days: excellent, good, fair, or rebuilding?' },
    { customer: "Way better than when I bought the car. I'd say excellent now.", record: { credit_band: 'excellent' } },
    { tool: 'options' },
    { agent: "With excellent credit you likely qualify for a much lower rate than your 8.9%. Refinancing could bring you to about 479 a month, saving roughly fifteen hundred dollars." },
    { customer: "What's APR exactly? I always thought it was the same as interest." },
    { tool: 'term', term: 'apr' },
    { agent: "Close! It's the yearly price of borrowing, like rent on the money. Lower rent, same car. Also, there's one open recall on your Camry, it's a free fix at any dealer." },
    { customer: "Let's do the refinance check. Is it a hard credit pull?" },
    { agent: "Checking your rate is a soft pull, so it won't affect your score. I'll text you the link." },
    { tool: 'finalize', option: 'refinance' },
  ],
  priya: (n) => [
    { agent: `Hi ${n}, this is Toyota Financial Services' AI assistant. This is an automated call, and you can ask for a person anytime. I wanted to check in about your Corolla. Is now an okay time?` },
    { customer: "Sure. Is this about the late payment? I'm sorry, my hours got cut last month." },
    { agent: "No need to apologize, that's exactly why I called. Thanks for telling me. Is money going to be tight for the next couple of months?" },
    { customer: "Probably, yeah. I can still pay most of it, just maybe not on the 20th.", record: { financial_stress: true, life_change: 'Work hours were cut', customer_quote: 'I can still pay most of it, just maybe not on the 20th.' } },
    { tool: 'options' },
    { agent: "The best move is to talk to a Toyota payment specialist. They can look at moving your due date closer to your payday, or a payment extension. I can't approve that myself, but I can connect you right now with everything we discussed." },
    { customer: "What's an extension?" },
    { tool: 'term', term: 'payment extension' },
    { tool: 'human', reason: 'Hours cut at work; requests due date change or payment extension; one late payment last month' },
    { agent: "A specialist has your details and will text you from this number shortly. You won't have to repeat anything. Your ToyotaCare maintenance also ends next month, so I'll include that reminder." },
    { tool: 'finalize', option: 'relief' },
  ],
  diego: (n) => [
    { agent: `Hi ${n}, this is Toyota Financial Services' AI assistant. This is an automated call. I noticed your Tacoma is putting on a lot more miles lately. Do you have two minutes?` },
    { customer: 'Ha, yeah. New job in Denton, it\'s like 80 miles round trip every day.', record: { life_change: 'New job, 80-mile round-trip commute', miles_per_year: 30000 } },
    { agent: 'That adds up fast. Do you still need the truck bed, or is it mostly commuting now?' },
    { customer: 'I still need the truck. I haul stuff on weekends. But gas is killing me.', record: { needs_same_vehicle_type: true, priority: 'save_fuel', customer_quote: 'I still need the truck. But gas is killing me.' } },
    { tool: 'options' },
    { agent: 'You have about twelve thousand dollars of equity in your Tacoma. You could put it toward a newer Tacoma, which keeps the bed. The payment and the gas savings are on your screen now.' },
    { customer: 'Equity meaning what I could sell it for?' },
    { tool: 'term', term: 'equity' },
    { customer: 'Okay, send me that and I\'ll test drive it.' },
    { tool: 'finalize', option: 'upgrade-tacoma' },
  ],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runSimulation(s: Session, speed = 1) {
  const c = customers.find((x) => x.id === s.customerId) ?? customers[0];
  const steps = (scripts[c.id] ?? scripts.maya)(c.firstName);
  // The call starts anonymous, exactly like a real one: the agent has to ask who this is.
  s.customerId = null;
  s.guest = undefined;
  s.channel = 'simulated';
  setStatus(s, 'dialing');
  await sleep(1200 / speed);
  toolSnapshot(s);
  const say = async (from: 'agent' | 'customer', text: string) => {
    addLine(s, { from, text, via: 'voice' });
    await sleep(Math.min(5200, 900 + text.length * 28) / speed);
  };
  await say('agent', "Hi! This is Toyota Financial Services' AI assistant. I'm an AI, and you can ask for a person anytime. Who am I speaking with?");
  await say('customer', `Hey, it's ${c.firstName} ${c.lastName}.`);
  await say('agent', `Nice to meet you, ${c.firstName}. Are you a current Toyota Financial Services customer? If so, what's your customer code?`);
  await say('customer', `Yeah, it's ${c.code}.`);
  toolIdentify(s, { name: `${c.firstName} ${c.lastName}`, customer_code: c.code });
  await sleep(800 / speed);
  steps[0] = { agent: (steps[0] as { agent: string }).agent.replace(/^Hi [^,]+, this is Toyota Financial Services' AI assistant\. This is an automated call(, and you can ask for a person anytime)?\. /, `Thanks, ${c.firstName}, I've got your account up. `) };
  for (const step of steps) {
    if ('agent' in step) {
      addLine(s, { from: 'agent', text: step.agent, via: 'voice' });
      await sleep(Math.min(5200, 900 + step.agent.length * 28) / speed);
    } else if ('customer' in step) {
      if (step.record) toolRecordAnswer(s, { ...step.record, customer_quote: undefined });
      addLine(s, { from: 'customer', text: step.customer, via: 'voice' });
      await sleep(Math.min(4000, 700 + step.customer.length * 25) / speed);
    } else if (step.tool === 'options') {
      toolGetOptions(s);
      await sleep(1500 / speed);
    } else if (step.tool === 'term') {
      toolExplainTerm(s, step.term);
      await sleep(900 / speed);
    } else if (step.tool === 'human') {
      toolRequestHuman(s, step.reason, 'high');
      await sleep(1200 / speed);
    } else if (step.tool === 'finalize') {
      await toolFinalize(s, step.option);
      await sleep(1200 / speed);
    }
  }
  addLine(s, { from: 'system', text: 'Call ended.' });
  setStatus(s, 'ended');
}
