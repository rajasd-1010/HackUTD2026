/**
 * One-command setup for the ElevenLabs voice agent (Claude as the brain).
 *
 *   npx tsx scripts/setup-voice-agent.ts
 *
 * Reads server/key.env. Creates (or updates) the six webhook tools pointing at
 * PUBLIC_BASE_URL, creates (or updates) the agent with a Claude model, then
 * prints the IDs to paste into server/key.env. Safe to re-run whenever your
 * tunnel URL changes.
 */

import dotenv from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { SYSTEM_PROMPT, FIRST_MESSAGE } from '../server/nextmove/agentPrompt.js';

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, '../server/key.env') });

const API = 'https://api.elevenlabs.io/v1';
const KEY = process.env.ELEVENLABS_API_KEY;
// On Render the public URL is provided automatically
const BASE = (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
const SECRET = process.env.TOOL_SECRET || '';

if (!KEY) fail('Set ELEVENLABS_API_KEY in server/key.env');
if (!BASE.startsWith('https://')) fail('Set PUBLIC_BASE_URL in server/key.env to your https tunnel URL (cloudflared/ngrok) pointing at port 3001');

function fail(msg: string): never {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'xi-api-key': KEY!, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { ok: res.ok, status: res.status, body };
}

const sid = { type: 'string', dynamic_variable: 'session_id' };

function toolDef(name: string, description: string, properties: Record<string, any> = {}, required: string[] = []) {
  return {
    type: 'webhook',
    name,
    description,
    response_timeout_secs: 20,
    api_schema: {
      url: `${BASE}/api/nm/tools/${name}`,
      method: 'POST',
      ...(SECRET ? { request_headers: { 'x-tool-secret': SECRET } } : {}),
      request_body_schema: {
        type: 'object',
        description: `${name} input`,
        required: ['session_id', ...required],
        properties: { session_id: sid, ...properties },
      },
    },
  };
}

const TOOLS = [
  toolDef('identify_customer', 'Call right after you learn the caller\'s name. Pass their customer code if they gave one (exactly as said). Returns their account, or creates a new customer ID for people without a code.', {
    name: { type: 'string', description: 'The caller\'s full name as they said it.' },
    customer_code: { type: 'string', description: 'Their customer code if they gave one, e.g. "TM-4821". Leave empty for new customers.' },
  }, ['name']),
  toolDef('get_customer_snapshot', 'Returns what is already known about the caller (account facts, or new-customer status). Use it if you lose track.'),
  toolDef('record_answer', 'Save what the customer just told you. Fill only the fields you learned.', {
    life_change: { type: 'string', description: 'Short description of any life change: new baby, new job, longer commute, moving, etc.' },
    needs_more_space: { type: 'boolean', description: 'True if they need a bigger vehicle (more seats or cargo).' },
    miles_per_year: { type: 'integer', description: 'Their estimated miles per year going forward.' },
    budget_max_monthly: { type: 'integer', description: 'Highest monthly payment they said is comfortable, in dollars.' },
    priority: { type: 'string', description: 'What matters most to them.', enum: ['lowest_payment', 'own_it', 'newest_tech', 'flexibility', 'save_fuel', 'pay_off_fast'] },
    keep_years: { type: 'integer', description: 'How many years they plan to keep their next vehicle.' },
    financial_stress: { type: 'boolean', description: 'True if money is tight, they missed or may miss a payment, or lost income.' },
    needs_same_vehicle_type: { type: 'boolean', description: 'True if they need the same kind of vehicle, e.g. still need a truck bed.' },
    vehicle_interest: { type: 'string', description: 'New customers: which Toyota they want, or what they need it for.' },
    current_car: { type: 'string', description: 'What they drive now, if anything.' },
    down_payment: { type: 'integer', description: 'How much they could put down, in dollars.' },
    credit_band: { type: 'string', description: 'Their rough credit.', enum: ['excellent', 'good', 'fair', 'rebuilding'] },
    wants: { type: 'string', description: 'Buying or leasing preference.', enum: ['buy', 'lease', 'unsure'] },
    customer_quote: { type: 'string', description: "The customer's own words for the key point, under 20 words." },
  }),
  toolDef('get_options', 'Compute the customer options with exact numbers from their account and answers. Call after you have asked your questions, and again if their answers change.'),
  toolDef('explain_term', 'Get a plain-language explanation and analogy for a finance term the customer is unsure about. It also appears on their screen.', {
    term: { type: 'string', description: 'The term, e.g. "APR", "residual value", "lease equity", "money factor", "refinance".' },
  }, ['term']),
  toolDef('request_human', 'Hand off to a human Toyota specialist with full context. Use for money trouble, complaints, anything you cannot answer, or when the customer asks for a person.', {
    reason: { type: 'string', description: 'One sentence on why, with the key facts so the specialist does not re-ask.' },
    urgency: { type: 'string', description: 'How urgent.', enum: ['normal', 'high'] },
  }, ['reason']),
  toolDef('finalize_call', 'Call when the customer has chosen a next step, before saying goodbye. Texts them a recap.', {
    chosen_option_id: { type: 'string', description: 'The option id in brackets from get_options, e.g. "refinance" or "buyout".' },
    next_step: { type: 'string', description: 'The concrete next step they agreed to.' },
    call_summary: { type: 'string', description: 'One sentence summary of the call.' },
  }),
];

async function upsertTools(): Promise<string[]> {
  const existing = await api('/convai/tools');
  const list: any[] = existing.body?.tools ?? [];
  const ids: string[] = [];
  for (const t of TOOLS) {
    const found = list.find((x) => x?.tool_config?.name === t.name);
    const r = found
      ? await api(`/convai/tools/${found.id}`, { method: 'PATCH', body: JSON.stringify({ tool_config: t }) })
      : await api('/convai/tools', { method: 'POST', body: JSON.stringify({ tool_config: t }) });
    if (!r.ok) fail(`Tool ${t.name} failed (${r.status}): ${JSON.stringify(r.body).slice(0, 600)}`);
    const id = r.body.id ?? found?.id;
    ids.push(id);
    console.log(`  ✓ tool ${t.name} → ${id}${found ? ' (updated)' : ''}`);
  }
  return ids;
}

async function pickClaude(): Promise<string> {
  if (process.env.ELEVENLABS_LLM) return process.env.ELEVENLABS_LLM;
  const r = await api('/convai/llm/list');
  const names: string[] = (r.body?.llms ?? []).filter((m: any) => !m.deprecation_info).map((m: any) => m.llm);
  const claude = names.filter((n) => /claude/i.test(n));
  // Prefer the newest Sonnet (smart tool use), then Haiku (fastest).
  const byVersion = (a: string, b: string) => b.localeCompare(a, undefined, { numeric: true });
  const pick = claude.filter((n) => /sonnet/i.test(n)).sort(byVersion)[0] ?? claude.filter((n) => /haiku/i.test(n)).sort(byVersion)[0] ?? claude[0];
  if (!pick) fail(`No Claude model in your ElevenLabs LLM list. Available: ${names.join(', ')}. Set ELEVENLABS_LLM to one of them.`);
  return pick;
}

const AGENT_NAME = 'The Fast and the Financed';

/** No agent ID set (fresh cloud deploy): reuse our agent if it already exists, so restarts don't make duplicates. */
async function findAgent(): Promise<string | undefined> {
  const r = await api('/convai/agents?page_size=100');
  const list: any[] = r.body?.agents ?? [];
  const hit = list.find((a) => a.name === AGENT_NAME || a.name === 'The Devil Wears Down Payments');
  if (hit) console.log(`  ✓ found existing agent ${hit.agent_id}`);
  return hit?.agent_id;
}

/** Save IDs so the server (which reads key.env at start) knows them. Never overrides real env vars. */
function remember(key: string, value: string) {
  const file = join(here, '../server/key.env');
  let s = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const re = new RegExp(`^${key}=.*$`, 'm');
  s = re.test(s) ? s.replace(re, `${key}=${value}`) : `${s.trimEnd()}\n${key}=${value}\n`;
  writeFileSync(file, s);
}

async function upsertAgent(toolIds: string[], llm: string) {
  const placeholders = {
    session_id: '',
    customer_first_name: 'there',
    customer_full_name: '',
    vehicle: 'Toyota',
    contract_type: 'loan',
    contract_summary: 'Caller not identified yet.',
    months_remaining: 0,
    monthly_payment: 0,
    city: '',
  };
  const build = (withPlaceholders: boolean) => ({
    name: AGENT_NAME,
    tags: ['hackutd2026', 'toyota'],
    conversation_config: {
      agent: {
        first_message: FIRST_MESSAGE,
        language: 'en',
        ...(withPlaceholders ? { dynamic_variables: { dynamic_variable_placeholders: placeholders } } : {}),
        prompt: {
          prompt: SYSTEM_PROMPT, llm, tool_ids: toolIds, temperature: 0.4,
          // Lets the agent hang up by itself after saying goodbye.
          ...(process.env.ELEVENLABS_NO_ENDCALL ? {} : { built_in_tools: { end_call: { type: 'system', name: 'end_call', description: 'Hang up after you have said goodbye.', params: { system_tool_type: 'end_call' } } } }),
        },
      },
      tts: { voice_id: process.env.ELEVENLABS_VOICE_ID || 'cjVigY5qzO86Huf0OWal' },
    },
  });
  const agentId = process.env.ELEVENLABS_AGENT_ID || await findAgent();
  const send = (body: any) =>
    agentId
      ? api(`/convai/agents/${agentId}`, { method: 'PATCH', body: JSON.stringify(body) })
      : api('/convai/agents/create', { method: 'POST', body: JSON.stringify(body) });
  let r = await send(build(true));
  if (r.status === 422) {
    console.warn('  ! placeholders rejected, retrying without them');
    r = await send(build(false));
  }
  if (!r.ok) fail(`Agent ${agentId ? 'update' : 'create'} failed (${r.status}): ${JSON.stringify(r.body).slice(0, 800)}`);
  return agentId || r.body.agent_id;
}

async function phoneNumbers(agentId: string) {
  const r = await api('/convai/phone-numbers');
  const list: any[] = Array.isArray(r.body) ? r.body : r.body?.phone_numbers ?? [];
  if (!list.length) {
    const number = process.env.PHOTON_NUMBER;
    const username = process.env.PHOTON_SIP_USERNAME;
    const password = process.env.PHOTON_SIP_PASSWORD;
    if (!number || !username || !password) {
      console.log('\n  No phone number in ElevenLabs yet. Set PHOTON_NUMBER, PHOTON_SIP_USERNAME and PHOTON_SIP_PASSWORD in key.env and re-run.');
      return null;
    }
    // Import the Photon number into ElevenLabs as a SIP trunk (same as the dashboard's "Import from SIP Trunk").
    const created = await api('/convai/phone-numbers', {
      method: 'POST',
      body: JSON.stringify({
        phone_number: number,
        label: 'Photon',
        provider: 'sip_trunk',
        agent_id: agentId,
        inbound_trunk_config: { media_encryption: 'allowed' },
        outbound_trunk_config: {
          address: process.env.PHOTON_SIP_ADDRESS || 'sip.photon.codes:5061',
          transport: 'tls',
          media_encryption: 'allowed',
          credentials: { username, password },
        },
      }),
    });
    if (!created.ok) fail(`Importing ${number} into ElevenLabs failed (${created.status}): ${JSON.stringify(created.body).slice(0, 600)}`);
    console.log(`  ✓ imported Photon number ${number} into ElevenLabs → ${created.body.phone_number_id}`);
    return created.body.phone_number_id as string;
  }
  const want = (process.env.PHOTON_NUMBER || '').replace(/[^\d]/g, '');
  const match = list.find((p) => String(p.phone_number || '').replace(/[^\d]/g, '').endsWith(want.slice(-10))) ?? list[0];
  // Also answer inbound calls to the Photon number with this agent.
  await api(`/convai/phone-numbers/${match.phone_number_id}`, { method: 'PATCH', body: JSON.stringify({ agent_id: agentId }) });
  console.log(`  ✓ phone ${match.phone_number} (${match.label ?? 'no label'}) → ${match.phone_number_id}, inbound calls go to this agent`);
  return match.phone_number_id as string;
}

(async () => {
  console.log(`\nSetting up The Fast and the Financed voice agent → tools at ${BASE}/api/nm/tools/*`);
  const llm = await pickClaude();
  console.log(`  ✓ brain: ${llm}`);
  const toolIds = await upsertTools();
  const agentId = await upsertAgent(toolIds, llm);
  console.log(`  ✓ agent ${agentId}`);
  const phoneId = await phoneNumbers(agentId);
  remember('ELEVENLABS_AGENT_ID', agentId);
  if (phoneId) remember('ELEVENLABS_PHONE_NUMBER_ID', phoneId);
  console.log('\nPut these in server/key.env, then restart the server:\n');
  console.log(`ELEVENLABS_AGENT_ID=${agentId}`);
  if (phoneId) console.log(`ELEVENLABS_PHONE_NUMBER_ID=${phoneId}`);
  console.log('');
})();
