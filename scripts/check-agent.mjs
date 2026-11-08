/**
 * npm run check:agent
 * Finds out why ElevenLabs says "The AI agent you are trying to reach is not available."
 * Checks credits, the agent's settings, and runs a 2-turn test chat. If the test fails,
 * it tries the usual fixes (remove the hang-up tool, switch the brain) and tells you what worked.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(join(root, 'server', 'key.env'), 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const KEY = env.ELEVENLABS_API_KEY;
const AGENT = env.ELEVENLABS_AGENT_ID;
if (!KEY || !AGENT) { console.log('ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID missing in server/key.env'); process.exit(1); }

async function api(path, init = {}) {
  const r = await fetch(`https://api.elevenlabs.io/v1${path}`, { ...init, headers: { 'xi-api-key': KEY, 'content-type': 'application/json', ...(init.headers || {}) } });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { ok: r.ok, status: r.status, body };
}
const short = (b) => (typeof b === 'string' ? b : JSON.stringify(b)).slice(0, 400);

async function testChat() {
  const r = await api(`/convai/agents/${AGENT}/simulate-conversation`, {
    method: 'POST',
    body: JSON.stringify({ simulation_specification: { simulated_user_config: { first_message: 'Hi, this is Maya.', language: 'en' } }, new_turns_limit: 2 }),
  });
  return r;
}

(async () => {
  console.log('\n1) Credits');
  const sub = await api('/user/subscription');
  if (sub.ok) {
    const s = sub.body;
    const used = s.character_count, limit = s.character_limit;
    console.log(`   plan: ${s.tier}   used ${used?.toLocaleString()} of ${limit?.toLocaleString()} credits   resets ${s.next_character_count_reset_unix ? new Date(s.next_character_count_reset_unix * 1000).toLocaleString() : '?'}`);
    if (limit && used >= limit * 0.98) console.log('   !! OUT OF CREDITS. This alone causes "agent not available". Fix: upgrade the plan, wait for the reset, or use a new ElevenLabs account and put its key in server/key.env, then run npm.cmd run go.');
  } else console.log(`   could not read (${sub.status}) ${short(sub.body)}`);

  console.log('\n2) Agent settings');
  const a = await api(`/convai/agents/${AGENT}`);
  if (!a.ok) { console.log(`   !! Agent not found (${a.status}). Delete ELEVENLABS_AGENT_ID from server/key.env and run npm.cmd run go to make a new one.`); return; }
  const p = a.body.conversation_config?.agent?.prompt ?? {};
  console.log(`   name: ${a.body.name}\n   brain: ${p.llm}\n   tools: ${(p.tool_ids || []).length}   hang-up tool: ${p.built_in_tools?.end_call ? 'on' : 'off'}`);

  console.log('\n3) Test chat');
  let t = await testChat();
  if (t.ok) { console.log('   ✓ The agent answers. If calls still fail, the problem is the phone line, not the agent.'); return; }
  console.log(`   ✗ failed (${t.status}) ${short(t.body)}`);

  console.log('\n4) Trying fix A: turn off the hang-up tool');
  await api(`/convai/agents/${AGENT}`, { method: 'PATCH', body: JSON.stringify({ conversation_config: { agent: { prompt: { built_in_tools: { end_call: null } } } } }) });
  t = await testChat();
  if (t.ok) { console.log('   ✓ That was it. Agent works again (calls just will not auto hang up). Set ELEVENLABS_NO_ENDCALL=1 in server/key.env so setup keeps it off.'); return; }
  console.log(`   ✗ still failing ${short(t.body)}`);

  console.log('\n5) Trying fix B: switch the brain to gemini-2.0-flash');
  await api(`/convai/agents/${AGENT}`, { method: 'PATCH', body: JSON.stringify({ conversation_config: { agent: { prompt: { llm: 'gemini-2.0-flash' } } } }) });
  t = await testChat();
  if (t.ok) { console.log(`   ✓ That was it: "${p.llm}" is not available on your plan. Add ELEVENLABS_LLM=gemini-2.0-flash to server/key.env so setup keeps it.`); return; }
  console.log(`   ✗ still failing ${short(t.body)}`);
  console.log('\nNone of the quick fixes worked. Copy everything above and send it to Claude.');
})();
