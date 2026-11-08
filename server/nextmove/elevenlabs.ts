/**
 * ElevenLabs Agents: place an outbound phone call through the Photon SIP trunk,
 * follow the call's transcript and end, or hand the browser a signed URL for the
 * in-browser voice fallback.
 */

import { addLine, emit, setStatus, type Session } from './store.js';
import { whoOf } from './profiles.js';
import { contractSummary } from './customers.js';
import { toolFinalize } from './tools.js';

const API = 'https://api.elevenlabs.io/v1';

const cfg = () => ({
  apiKey: process.env.ELEVENLABS_API_KEY || '',
  agentId: process.env.ELEVENLABS_AGENT_ID || '',
  phoneNumberId: process.env.ELEVENLABS_PHONE_NUMBER_ID || '',
});

export function voiceConfigured() {
  const c = cfg();
  return { phone: Boolean(c.apiKey && c.agentId && c.phoneNumberId), browser: Boolean(c.apiKey && c.agentId) };
}

export function dynamicVariables(s: Session): Record<string, string | number> {
  const w = whoOf(s);
  const base = { session_id: s.id, customer_first_name: 'there', customer_full_name: '', vehicle: 'Toyota', contract_type: 'unknown', contract_summary: 'Caller not identified yet.', months_remaining: 0, monthly_payment: 0, city: '' };
  if (w.kind !== 'customer') return base;
  const c = w.c;
  return {
    ...base,
    customer_first_name: c.firstName,
    customer_full_name: `${c.firstName} ${c.lastName}`,
    vehicle: `${c.vehicle.year} ${c.vehicle.model} ${c.vehicle.trim}`,
    contract_type: c.contract.type,
    contract_summary: contractSummary(c),
    months_remaining: c.contract.monthsRemaining,
    monthly_payment: c.contract.monthlyPayment,
    city: c.city,
  };
}

export async function startOutboundCall(s: Session, toNumber: string) {
  const { apiKey, agentId, phoneNumberId } = cfg();
  const res = await fetch(`${API}/convai/sip-trunk/outbound-call`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_id: agentId,
      agent_phone_number_id: phoneNumberId,
      to_number: toNumber,
      conversation_initiation_client_data: { dynamic_variables: dynamicVariables(s) },
    }),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    throw new Error(`ElevenLabs outbound call failed (${res.status}): ${JSON.stringify(body).slice(0, 400)}`);
  }
  const conversationId = (body.conversation_id as string | null) ?? null;
  if (conversationId) followConversation(s, conversationId);
  return { conversationId, sipCallId: body.sip_call_id as string | null };
}

/**
 * Follow a call: copy each new turn of the transcript onto the customer's screen as it
 * appears, and mark the session ended the moment the call hangs up.
 */
export function followConversation(s: Session, conversationId: string) {
  s.conversationId = conversationId;
  s.transcriptSeen = 0;
  const started = Date.now();
  let hungUpAt = 0;
  let loggedEmpty = false;

  /** Put a turn on screen. Turns that arrive after hang-up go above the "Call ended" line, so the order stays right. */
  const place = (line: { from: 'customer' | 'agent'; text: string }) => {
    if (s.status !== 'ended') return addLine(s, { ...line, via: 'voice' });
    const at = s.lines.map((l) => l.from === 'system' && l.text === s.endedReason).lastIndexOf(true);
    const full = { ...line, via: 'voice' as const, at: new Date().toISOString() };
    if (at >= 0) s.lines.splice(at, 0, full); else s.lines.push(full);
    emit(s, 'line', full);
  };

  const tick = async () => {
    let finished = false;
    try {
      const res = await fetch(`${API}/convai/conversations/${encodeURIComponent(conversationId)}`, { headers: { 'xi-api-key': cfg().apiKey } });
      if (res.ok) {
        const conv: any = await res.json();
        const turns: Array<{ role: string; message: string | null }> = conv.transcript ?? [];
        if (conv.status === 'in-progress' && !turns.length && !loggedEmpty && Date.now() - started > 20000) {
          loggedEmpty = true;
          console.log('[elevenlabs] call is live but ElevenLabs has not shared any transcript yet; it will appear when they do.');
        }
        for (let i = s.transcriptSeen ?? 0; i < turns.length; i++) {
          const t = turns[i];
          // Drop the voice's expression tags like [happy] or [sad]; they are for the speech, not for reading.
          const text = (t?.message || '').replace(/\[[a-z][a-z ]{0,20}\]\s*/gi, '').trim();
          if (!text) continue;
          if (s.status === 'dialing') setStatus(s, 'in_call');
          place({ from: t.role === 'user' ? 'customer' : 'agent', text });
        }
        s.transcriptSeen = turns.length;
        if (conv.status === 'in-progress' && s.status === 'dialing') setStatus(s, 'in_call');
        // Hung up: show "Call ended" right away, but keep reading until ElevenLabs is done
        // so the full conversation still lands on screen.
        if (['processing', 'done', 'failed'].includes(conv.status) && s.status !== 'ended') {
          hungUpAt = Date.now();
          await endCall(s, conv.status === 'failed' && !turns.length ? 'The call could not connect.' : 'Call ended.');
        }
        if (conv.status === 'done' || conv.status === 'failed') finished = true;
      }
      // Nobody picked up and ElevenLabs never reported the call: stop waiting
      if (s.status === 'dialing' && Date.now() - started > 75000) {
        await endCall(s, 'No answer. Try again, or check the number.');
        finished = true;
      }
    } catch (e) {
      console.error('[elevenlabs] follow failed:', (e as Error).message);
    }
    if (finished) return;
    if (hungUpAt && Date.now() - hungUpAt > 3 * 60 * 1000) return;
    if (Date.now() - started > 20 * 60 * 1000) return void endCall(s, 'Stopped following the call after 20 minutes.');
    setTimeout(tick, 1000);
  };
  setTimeout(tick, 1000);
}

async function endCall(s: Session, note: string) {
  if (s.status === 'ended') return;
  if (!s.recap && s.result) await toolFinalize(s).catch(() => undefined);
  s.endedReason = note;
  addLine(s, { from: 'system', text: note });
  setStatus(s, 'ended');
  emit(s, 'call_ended', { note });
}

export async function getSignedUrl(): Promise<string> {
  const { apiKey, agentId } = cfg();
  const res = await fetch(`${API}/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, {
    headers: { 'xi-api-key': apiKey },
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || !body.signed_url) throw new Error(`Could not get signed URL (${res.status}): ${JSON.stringify(body).slice(0, 300)}`);
  return body.signed_url;
}
