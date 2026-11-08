/**
 * Claude-powered texting agent. After the call, the customer can text the Photon number back
 * and Claude answers using the same tools and numbers as the voice agent.
 * A human advisor can take over the thread at any time from the Advisor console.
 */

import Anthropic from '@anthropic-ai/sdk';
import { addLine, type Session } from './store.js';
import { firstNameOf } from './profiles.js';
import { toolSnapshot, toolRecordAnswer, toolGetOptions, toolExplainTerm, toolRequestHuman } from './tools.js';

let client: Anthropic | null = null;
export function claudeConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
function claude() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

const tools: Anthropic.Tool[] = [
  {
    name: 'get_options',
    description: "Recompute the customer's options and numbers from their account and everything they've said. Use before quoting any number.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'record_answer',
    description: 'Save something new the customer told you about their situation.',
    input_schema: {
      type: 'object',
      properties: {
        life_change: { type: 'string' },
        needs_more_space: { type: 'boolean' },
        miles_per_year: { type: 'integer' },
        budget_max_monthly: { type: 'integer' },
        priority: { type: 'string', enum: ['lowest_payment', 'own_it', 'newest_tech', 'flexibility', 'save_fuel', 'pay_off_fast'] },
        financial_stress: { type: 'boolean' },
        needs_same_vehicle_type: { type: 'boolean' },
      },
    },
  },
  {
    name: 'explain_term',
    description: 'Get the plain-language definition of a finance term (APR, residual value, equity, money factor...). Also adds it to the Learn panel.',
    input_schema: { type: 'object', properties: { term: { type: 'string' } }, required: ['term'] },
  },
  {
    name: 'request_human',
    description: 'Hand the conversation to a human Toyota specialist. Use for hardship, disputes, anything you cannot answer, or when asked.',
    input_schema: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] },
  },
];

function runTool(s: Session, name: string, input: any): string {
  switch (name) {
    case 'get_options': return toolGetOptions(s);
    case 'record_answer': return toolRecordAnswer(s, input);
    case 'explain_term': return toolExplainTerm(s, input.term);
    case 'request_human': return toolRequestHuman(s, input.reason);
    default: return 'Unknown tool';
  }
}

function system(s: Session) {
  return `You are the Toyota Financial Services assistant texting with ${firstNameOf(s)} after a phone call about their next move.
Account facts (do not ask for these):
${toolSnapshot(s)}

Rules:
- This is SMS. Reply in 1-3 short sentences, plain text, no markdown, no emojis.
- Only quote numbers returned by get_options. Never invent rates, payments, or approvals. Say "estimate" for numbers.
- If they seem confused by a term, call explain_term and explain it simply.
- Money trouble, complaints, legal questions, or "talk to a person": call request_human and tell them a specialist will text them here.
- You are an AI. Say so if asked. Never promise an offer is approved.`;
}

/** Returns the reply text (already logged to the session), or null if Claude isn't configured. */
export async function claudeTextReply(s: Session): Promise<string | null> {
  if (!claudeConfigured()) return null;
  const history: Anthropic.MessageParam[] = s.lines
    .filter((l) => l.via === 'text' && (l.from === 'customer' || l.from === 'agent' || l.from === 'advisor'))
    .slice(-12)
    .map((l) => ({ role: l.from === 'customer' ? 'user' : 'assistant', content: l.text }));
  // Messages must start with the user and alternate; merge consecutive same-role turns.
  const msgs: Anthropic.MessageParam[] = [];
  for (const m of history) {
    const last = msgs[msgs.length - 1];
    if (last && last.role === m.role) last.content = `${last.content}\n${m.content}`;
    else msgs.push({ ...m });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length) return null;

  for (let turn = 0; turn < 5; turn++) {
    const res = await claude().messages.create({ model: MODEL(), max_tokens: 400, system: system(s), tools, messages: msgs });
    if (res.stop_reason === 'tool_use') {
      msgs.push({ role: 'assistant', content: res.content });
      const results: Anthropic.ToolResultBlockParam[] = res.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
        .map((b) => ({ type: 'tool_result', tool_use_id: b.id, content: runTool(s, b.name, b.input) }));
      msgs.push({ role: 'user', content: results });
      continue;
    }
    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join(' ').trim();
    if (text) addLine(s, { from: 'agent', text, via: 'text' });
    return text || null;
  }
  return null;
}
