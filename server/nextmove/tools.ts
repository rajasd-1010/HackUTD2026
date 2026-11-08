/**
 * Tool handlers. The ElevenLabs voice agent calls these over HTTP during a live call,
 * and the simulator calls them directly. Every handler updates the session and pushes
 * the change to the customer's screen in real time.
 */

import { observedMilesPerYear, type CustomerProfile } from './customers.js';
import { computeNextMove, computeGuestMoves, spokenBrief, CATALOG, type Answers, type Priority, type CreditBand } from './engine.js';
import { findTerm } from './glossary.js';
import { addLine, emit, setStatus, type Session } from './store.js';
import { sendText } from './photon.js';
import { whoOf, findByCode, createGuest, firstNameOf, refOf } from './profiles.js';

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** The current customer, or undefined for a new or not-yet-identified caller. */
export function customerOf(s: Session): CustomerProfile | undefined {
  const w = whoOf(s);
  return w.kind === 'customer' ? w.c : undefined;
}

function markLive(s: Session) {
  if (s.status === 'dialing' || s.status === 'idle') setStatus(s, 'in_call');
}

function accountFacts(c: CustomerProfile): string {
  const k = c.contract;
  return [
    `Customer: ${c.firstName} ${c.lastName}, ${c.city}. Customer code ${c.code}.`,
    `Vehicle: ${c.vehicle.year} ${c.vehicle.model} ${c.vehicle.trim}, ${c.vehicle.color}, ${c.vehicle.odometer.toLocaleString()} miles on it (about ${observedMilesPerYear(c).toLocaleString()} a year so far). Estimated value ${money(c.vehicle.estMarketValue)}.`,
    k.type === 'lease'
      ? `Lease: ${money(k.monthlyPayment)}/month, ${k.monthsRemaining} months left, buyout (residual) ${money(k.residualValue ?? k.payoffAmount)}, allowance ${(k.mileageAllowancePerYear ?? 12000).toLocaleString()} miles/year.`
      : `Loan: ${money(k.monthlyPayment)}/month at ${k.apr}% APR, ${k.monthsRemaining} payments left, payoff ${money(k.payoffAmount)}.`,
    c.service.openRecalls ? `Open recalls: ${c.service.openRecalls}.` : '',
    'This is all the account holds. Do not ask for anything listed here. Ask about what has changed in their life, how they drive now, a comfortable monthly payment, roughly how their credit is (excellent, good, fair, or rebuilding), whether money is tight, and what matters most. Their situation comes only from what they tell you.',
  ].filter(Boolean).join('\n');
}

const NEW_CUSTOMER_QUESTIONS =
  'Ask, one at a time: what they drive now (if anything), which Toyota they are thinking about or what they need a car for, a comfortable monthly payment, how much they could put down, whether they lean toward buying or leasing, and roughly how their credit is (excellent, good, fair, or rebuilding). Record each answer with record_answer, then call get_options.';

/** What the agent already knows, so it never asks for it. */
export function toolSnapshot(s: Session): string {
  markLive(s);
  const w = whoOf(s);
  emit(s, 'snapshot_loaded');
  if (w.kind === 'customer') return accountFacts(w.c);
  if (w.kind === 'guest') return `New customer ${w.g.firstName} ${w.g.lastName}, ID ${w.g.id}. No account yet. ${NEW_CUSTOMER_QUESTIONS}`;
  return 'Caller not identified yet. Ask their name, then whether they are a current Toyota Financial Services customer and their customer code. Then call identify_customer.';
}

/** Step one of every call: who is this? Looks up a customer code, or creates a new customer ID. */
export function toolIdentify(s: Session, p: { name?: string; customer_code?: string; is_current_customer?: boolean | string }): string {
  markLive(s);
  const name = (p.name || '').trim();
  if (name) s.callerName = name;
  const code = (p.customer_code || '').trim();
  if (code) {
    const c = findByCode(code);
    if (!c) {
      emit(s, 'identify_failed', { code });
      return `No account matches "${code}". Ask them to read it once more (codes look like TM followed by four digits). If it still does not match, say no problem, you will set them up as a new customer, and call identify_customer again with only their name.`;
    }
    s.customerId = c.id;
    s.guest = undefined;
    addLine(s, { from: 'system', text: `Signed in as ${c.firstName} ${c.lastName} (customer ${c.code})` });
    emit(s, 'identified', { kind: 'customer', code: c.code });
    return `Found the account. Greet ${c.firstName} by name and say you have their account up.\n${accountFacts(c)}`;
  }
  const g = createGuest(name || 'Guest');
  s.customerId = null;
  s.guest = { id: g.id, firstName: g.firstName, lastName: g.lastName };
  addLine(s, { from: 'system', text: `New customer: ${g.firstName}${g.lastName ? ` ${g.lastName}` : ''}, ID ${g.id}` });
  emit(s, 'identified', { kind: 'guest', id: g.id });
  const spoken = g.id.replace('NEW-', '').split('').join(' ');
  return `New customer created. Welcome ${g.firstName} to Toyota and tell them their new customer ID is "NEW" ${spoken}; it is also on their screen. ${NEW_CUSTOMER_QUESTIONS}`;
}

const PRIORITIES: Priority[] = ['lowest_payment', 'own_it', 'newest_tech', 'flexibility', 'save_fuel', 'pay_off_fast'];
const PRIORITY_LABEL: Record<Priority, string> = {
  lowest_payment: 'Lowest monthly payment',
  own_it: 'Owning the car',
  newest_tech: 'Newest model and tech',
  flexibility: 'Flexibility',
  save_fuel: 'Saving on fuel',
  pay_off_fast: 'Paying it off faster',
};
const BANDS: CreditBand[] = ['excellent', 'good', 'fair', 'rebuilding'];

export interface AnswerParams {
  life_change?: string;
  needs_more_space?: boolean;
  miles_per_year?: number;
  budget_max_monthly?: number;
  priority?: string;
  keep_years?: number;
  financial_stress?: boolean;
  needs_same_vehicle_type?: boolean;
  vehicle_interest?: string;
  down_payment?: number;
  credit_band?: string;
  wants?: string;
  current_car?: string;
  customer_quote?: string;
}

const bool = (v: unknown) => (typeof v === 'string' ? v === 'true' : v === true ? true : v === false ? false : undefined);
const num = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v));
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function toolRecordAnswer(s: Session, p: AnswerParams): string {
  markLive(s);
  const a: Answers = s.answers;
  const heard: Array<[string, string]> = [];
  if (p.life_change) { a.lifeChange = p.life_change; heard.push(['Life change', p.life_change]); }
  if (p.current_car) { a.currentCar = p.current_car; heard.push(['Drives now', p.current_car]); }
  if (p.vehicle_interest) { a.vehicleInterest = p.vehicle_interest; heard.push(['Interested in', p.vehicle_interest]); }
  const space = bool(p.needs_more_space);
  if (space !== undefined) { a.needsMoreSpace = space; heard.push(['Needs more space', space ? 'Yes' : 'No']); }
  const miles = num(p.miles_per_year);
  if (miles && !Number.isNaN(miles)) { a.milesPerYear = miles; heard.push(['Miles per year', miles.toLocaleString()]); }
  const budget = num(p.budget_max_monthly);
  if (budget && !Number.isNaN(budget)) { a.budgetMaxMonthly = budget; heard.push(['Comfortable monthly budget', `up to ${money(budget)}`]); }
  const down = num(p.down_payment);
  if (down !== undefined && !Number.isNaN(down)) { a.downPayment = down; heard.push(['Down payment', money(down)]); }
  if (p.credit_band && BANDS.includes(p.credit_band as CreditBand)) { a.creditBand = p.credit_band as CreditBand; heard.push(['Credit', cap(p.credit_band)]); }
  if (p.wants && ['buy', 'lease', 'unsure'].includes(p.wants)) { a.wants = p.wants as Answers['wants']; heard.push(['Leaning toward', p.wants === 'unsure' ? 'Not sure yet' : cap(p.wants)]); }
  if (p.priority && PRIORITIES.includes(p.priority as Priority)) { a.priority = p.priority as Priority; heard.push(['Top priority', PRIORITY_LABEL[a.priority]]); }
  const keep = num(p.keep_years);
  if (keep && !Number.isNaN(keep)) { a.keepYears = keep; heard.push(['Plans to keep next car', `${keep} years`]); }
  const stress = bool(p.financial_stress);
  if (stress !== undefined) { a.financialStress = stress; heard.push(['Money tight right now', stress ? 'Yes' : 'No']); }
  const same = bool(p.needs_same_vehicle_type);
  if (same !== undefined) { a.needsSameVehicleType = same; heard.push(['Needs same type of vehicle', same ? 'Yes' : 'No']); }

  const at = new Date().toISOString();
  heard.forEach(([label, value], i) => s.heard.push({ label, value, quote: i === 0 ? p.customer_quote : undefined, at }));
  emit(s, 'answers', { heard });
  if (stress) return 'Recorded. Be warm and calm. Do not pitch upgrades. Call get_options; it will include a human specialist option.';
  return heard.length ? `Recorded: ${heard.map(([l, v]) => `${l} = ${v}`).join('; ')}.` : 'Nothing new recorded.';
}

function compute(s: Session) {
  const c = customerOf(s);
  return c ? computeNextMove(c, s.answers) : computeGuestMoves(s.answers);
}

export function toolGetOptions(s: Session): string {
  const w = whoOf(s);
  if (w.kind === 'unknown') return 'You have not identified the caller yet. Ask their name and customer code, call identify_customer, then try again.';
  setStatus(s, 'analyzing');
  s.result = compute(s);
  emit(s, 'options', s.result);
  setStatus(s, 'in_call');
  const known = w.kind === 'guest' && !s.answers.vehicleInterest ? `\n(They did not name a model, so this uses a ${CATALOG.find((m) => m.model === 'RAV4')!.model} as an example. Say so.)` : '';
  return spokenBrief(w.kind === 'customer' ? w.c : (undefined as unknown as CustomerProfile), s.result) + known;
}

export function toolExplainTerm(s: Session, term: string): string {
  const t = findTerm(term || '');
  if (!t) {
    emit(s, 'term_missing', { term });
    return `No glossary entry for "${term}". Explain it in one plain sentence yourself and offer to include it in the text recap.`;
  }
  if (!s.learned.find((x) => x.key === t.key)) s.learned.push(t);
  emit(s, 'term', t);
  return `${t.short} Analogy: ${t.analogy} Why it matters: ${t.whyItMatters} (Now shown on their screen under "What you learned".)`;
}

export function toolRequestHuman(s: Session, reason: string, urgency = 'normal'): string {
  const already = s.handoff?.open;
  s.handoff = { reason: reason || 'Customer asked for a person', urgency, at: new Date().toISOString(), open: true };
  addLine(s, { from: 'system', text: `Handed to a Toyota specialist: ${s.handoff.reason}` });
  emit(s, 'handoff', s.handoff);
  // Tell the customer right away, by text, that a person has their case.
  if (!already && s.phone && s.channel !== 'simulated') {
    const ref = refOf(s);
    const text = `Toyota Financial Services: Hi ${firstNameOf(s)}, a Toyota specialist now has your case${ref ? ` (${ref})` : ''} and everything we talked about. They'll text you here shortly, so you won't need to repeat anything. Reply here anytime.`;
    sendText(s.phone, text, `handoff-${s.id}`).then((r) => {
      addLine(s, { from: 'agent', text, via: 'text' });
      if (!r.ok) addLine(s, { from: 'system', text: `Couldn't text the specialist notice: ${r.error}` });
    });
  }
  return 'A Toyota specialist now has the full conversation and numbers, and the customer was just texted that a specialist has their case. Tell them a real person will text them from this same number shortly, and they will not need to repeat anything. Then ask if there is anything else before you wrap up.';
}

export function buildRecap(s: Session): string {
  const appUrl = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173').replace(/\/$/, '');
  const chosen = s.result?.options.find((o) => o.id === (s.chosenOptionId || s.result?.recommendedId));
  const ref = refOf(s);
  const parts = [`Toyota Financial Services: Hi ${firstNameOf(s)}, here's your recap from today's call.${ref ? ` Your customer ID: ${ref}.` : ''}`];
  if (chosen) {
    const pay = chosen.monthlyPayment !== null && chosen.monthlyPayment > 0 ? `, about ${money(chosen.monthlyPayment)}/mo` : '';
    parts.push(`Your next move: ${chosen.title}${pay}. ${chosen.impactLabel}.`);
    parts.push(`Next step: ${s.nextStepLabel || chosen.nextStep.label}.`);
  }
  if (s.learned.length) parts.push(`Terms we covered: ${s.learned.map((t) => t.term).join(', ')}.`);
  if (s.handoff?.open) parts.push('A Toyota specialist will text you here shortly.');
  parts.push(`All options and the math: ${appUrl}/?session=${s.id}`);
  parts.push('Reply ADVISOR to text a person, or CALL for a callback. Estimates only, not an offer. Reply STOP to opt out.');
  return parts.join('\n');
}

export async function toolFinalize(s: Session, chosenOptionId?: string, nextStepLabel?: string, summary?: string): Promise<string> {
  if (!s.result && whoOf(s).kind !== 'unknown') s.result = compute(s);
  if (chosenOptionId && s.result?.options.some((o) => o.id === chosenOptionId)) s.chosenOptionId = chosenOptionId;
  if (nextStepLabel) s.nextStepLabel = nextStepLabel;
  if (summary) addLine(s, { from: 'system', text: `Call summary: ${summary}` });
  setStatus(s, 'wrapping_up');
  const text = buildRecap(s);
  let delivered = false;
  let error: string | undefined;
  if (s.phone && s.channel !== 'simulated') {
    const r = await sendText(s.phone, text, `recap-${s.id}`);
    delivered = r.ok;
    error = r.error;
  } else {
    error = s.channel === 'simulated' ? 'Simulated call: recap shown on screen only' : 'No phone number on file';
  }
  s.recap = { text, delivered, via: delivered ? (process.env.PHOTON_PLATFORM || 'sms') : 'screen', error, at: new Date().toISOString() };
  emit(s, 'recap', s.recap);
  return delivered
    ? 'Recap texted. Tell them it is on their phone now, thank them by name, say goodbye, then call end_call.'
    : 'Recap is on their screen (text could not be sent). Tell them they can see everything on screen, thank them, say goodbye, then call end_call.';
}
