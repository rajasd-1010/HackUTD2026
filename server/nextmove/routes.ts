/**
 * "What's Your Next Move?" API.
 *   Browser   -> /api/nm/*          (customers, sessions, call me, simulate, advisor replies, metrics)
 *   Voice AI  -> /api/nm/tools/*    (ElevenLabs agent webhook tools, called during the live call)
 *   ElevenLabs-> /api/nm/webhooks/* (optional post-call transcript)
 */

import type { Express, Request, Response } from 'express';
import type { Server as SocketIOServer } from 'socket.io';
import { customers, getCustomer } from './customers.js';
import { glossary } from './glossary.js';
import {
  attachIO, createSession, getSession, latestSession, latestSessionForPhone, allSessions, listHandoffs,
  addLine, emit, setStatus, normalizePhone, type Session,
} from './store.js';
import { toolIdentify, toolSnapshot, toolRecordAnswer, toolGetOptions, toolExplainTerm, toolRequestHuman, toolFinalize } from './tools.js';
import { startOutboundCall, getSignedUrl, dynamicVariables, voiceConfigured } from './elevenlabs.js';
import { sendText, startInboundPolling, photonConfigured, type InboundText } from './photon.js';
import { runSimulation } from './simulate.js';
import { claudeTextReply, claudeConfigured } from './textAgent.js';

export function registerNextMove(app: Express, io: SocketIOServer) {
  attachIO(io);

  // ---------------- Browser-facing ----------------
  app.get('/api/nm/config', (_req, res) => {
    res.json({ voice: voiceConfigured(), texting: photonConfigured(), claude: claudeConfigured(), photonNumber: process.env.PHOTON_NUMBER || null });
  });

  app.get('/api/nm/customers', (_req, res) => res.json(customers));
  app.get('/api/nm/glossary', (_req, res) => res.json(glossary));

  app.post('/api/nm/sessions', (req: Request, res: Response) => {
    const { customerId } = req.body ?? {};
    if (customerId && !getCustomer(customerId)) return res.status(400).json({ error: 'Unknown customerId' });
    res.json(createSession(customerId || null));
  });

  app.get('/api/nm/sessions/:id', (req, res) => {
    const s = getSession(String(req.params.id));
    if (!s) return res.status(404).json({ error: 'Session not found' });
    res.json(s);
  });

  app.post('/api/nm/sessions/:id/call', async (req: Request, res: Response) => {
    const s = getSession(String(req.params.id));
    if (!s) return res.status(404).json({ error: 'Session not found' });
    const { phone, consent } = req.body ?? {};
    if (!consent) return res.status(400).json({ error: 'Consent is required before we call.' });
    if (!phone || normalizePhone(phone).length < 11) return res.status(400).json({ error: 'Enter a valid phone number, like +1 469 555 0123.' });
    if (!voiceConfigured().phone) return res.status(503).json({ error: 'Voice calling is not configured yet. Use "Simulate call" or "Talk in browser".' });
    s.phone = normalizePhone(phone);
    s.channel = 'phone';
    setStatus(s, 'dialing');
    try {
      const r = await startOutboundCall(s, s.phone);
      s.conversationId = r.conversationId ?? undefined;
      emit(s, 'call_placed', r);
      res.json({ ok: true, ...r });
    } catch (e) {
      setStatus(s, 'failed');
      addLine(s, { from: 'system', text: (e as Error).message });
      res.status(502).json({ error: (e as Error).message });
    }
  });

  app.post('/api/nm/sessions/:id/simulate', (req, res) => {
    const s = getSession(String(req.params.id));
    if (!s) return res.status(404).json({ error: 'Session not found' });
    if (req.body?.phone) s.phone = normalizePhone(req.body.phone);
    runSimulation(s, Number(req.body?.speed) || 1).catch((e) => console.error('simulation failed', e));
    res.json({ ok: true });
  });

  app.get('/api/nm/sessions/:id/browser-voice', async (req, res) => {
    const s = getSession(String(req.params.id));
    if (!s) return res.status(404).json({ error: 'Session not found' });
    if (!voiceConfigured().browser) return res.status(503).json({ error: 'Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID first.' });
    try {
      s.channel = 'browser';
      res.json({ signedUrl: await getSignedUrl(), dynamicVariables: dynamicVariables(s) });
    } catch (e) {
      res.status(502).json({ error: (e as Error).message });
    }
  });

  app.post('/api/nm/sessions/:id/status', (req, res) => {
    const s = getSession(String(req.params.id));
    if (!s) return res.status(404).json({ error: 'Session not found' });
    const status = req.body?.status;
    if (['in_call', 'ended'].includes(status)) setStatus(s, status);
    res.json({ ok: true });
  });

  // Browser-voice transcript lines (the in-browser fallback can see the live transcript)
  app.post('/api/nm/sessions/:id/line', (req, res) => {
    const s = getSession(String(req.params.id));
    if (!s) return res.status(404).json({ error: 'Session not found' });
    const from = req.body?.from === 'customer' ? 'customer' : 'agent';
    const text = String(req.body?.text || '').replace(/\[[a-z][a-z ]{0,20}\]\s*/gi, '').trim().slice(0, 1000);
    if (text) addLine(s, { from, text, via: 'voice' });
    res.json({ ok: true });
  });

  // Customer asks for a person from the Help page
  app.post('/api/nm/sessions/:id/handoff', (req, res) => {
    const s = getSession(String(req.params.id));
    if (!s) return res.status(404).json({ error: 'Session not found' });
    const note = String(req.body?.note || '').trim().slice(0, 500);
    if (req.body?.phone && normalizePhone(String(req.body.phone)).length >= 11) s.phone = normalizePhone(String(req.body.phone));
    if (note) addLine(s, { from: 'customer', text: note, via: 'text' });
    toolRequestHuman(s, note ? `Customer asked for a person: "${note.slice(0, 160)}"` : 'Customer asked for a person from the Help page', 'normal');
    res.json({ ok: true });
  });

  // Customer picks a different option on screen
  app.post('/api/nm/sessions/:id/choose', (req, res) => {
    const s = getSession(String(req.params.id));
    if (!s) return res.status(404).json({ error: 'Session not found' });
    s.chosenOptionId = String(req.body?.optionId || '');
    emit(s, 'chosen', { optionId: s.chosenOptionId });
    res.json({ ok: true });
  });

  // ---------------- Human advisor (human-in-the-loop) ----------------
  app.get('/api/nm/advisor/handoffs', (_req, res) => res.json(listHandoffs()));

  app.post('/api/nm/advisor/:id/reply', async (req, res) => {
    const s = getSession(String(req.params.id));
    if (!s) return res.status(404).json({ error: 'Session not found' });
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Empty message' });
    const r = s.phone ? await sendText(s.phone, text, `advisor-${s.id}-${Date.now()}`) : { ok: false, error: 'No phone on file' };
    addLine(s, { from: 'advisor', text, via: 'text' });
    res.json({ ok: true, delivered: r.ok, error: r.error });
  });

  app.post('/api/nm/advisor/:id/resolve', (req, res) => {
    const s = getSession(String(req.params.id));
    if (!s?.handoff) return res.status(404).json({ error: 'No handoff' });
    s.handoff.open = false;
    emit(s, 'handoff', s.handoff);
    res.json({ ok: true });
  });

  // Lets you test the inbound-text flow without a phone
  app.post('/api/nm/dev/inbound-text', (req, res) => {
    handleInboundText({ id: `dev-${Date.now()}`, phone: normalizePhone(String(req.body?.phone || '')), text: String(req.body?.text || '') });
    res.json({ ok: true });
  });

  // ---------------- Business value ----------------
  app.get('/api/nm/metrics', (_req, res) => res.json(metrics()));

  // ---------------- Voice agent tools (ElevenLabs webhook tools) ----------------
  const tool = (handler: (s: Session, body: any) => string | Promise<string>) => async (req: Request, res: Response) => {
    const secret = process.env.TOOL_SECRET;
    if (secret && req.get('x-tool-secret') !== secret) return res.status(401).json({ error: 'bad tool secret' });
    const body = req.body ?? {};
    console.log(`[tool] ${req.path.split('/').pop()} session=${body.session_id ?? '-'}`);
    const s = resolveSession(body.session_id);
    if (!s) return res.json({ result: 'No active session. Apologize and say a Toyota specialist will follow up.' });
    try {
      const result = await handler(s, body);
      res.json({ result });
    } catch (e) {
      console.error('[tool] error', e);
      res.json({ result: 'That lookup failed. Do not guess numbers. Offer to have a specialist follow up by text.' });
    }
  };

  app.post('/api/nm/tools/identify_customer', tool((s, b) => toolIdentify(s, b)));
  app.post('/api/nm/tools/get_customer_snapshot', tool((s) => toolSnapshot(s)));
  app.post('/api/nm/tools/record_answer', tool((s, b) => toolRecordAnswer(s, b)));
  app.post('/api/nm/tools/get_options', tool((s) => toolGetOptions(s)));
  app.post('/api/nm/tools/explain_term', tool((s, b) => toolExplainTerm(s, String(b.term || ''))));
  app.post('/api/nm/tools/request_human', tool((s, b) => toolRequestHuman(s, String(b.reason || ''), String(b.urgency || 'normal'))));
  app.post('/api/nm/tools/finalize_call', tool((s, b) => toolFinalize(s, b.chosen_option_id, b.next_step, b.call_summary)));

  // ---------------- Optional: ElevenLabs post-call webhook ----------------
  app.post('/api/nm/webhooks/elevenlabs', async (req, res) => {
    const data = req.body?.data ?? {};
    const sid = data?.conversation_initiation_client_data?.dynamic_variables?.session_id;
    const s = resolveSession(sid) ?? allSessions().find((x) => x.conversationId && x.conversationId === data.conversation_id);
    if (s) {
      const transcript: Array<{ role: string; message: string }> = data.transcript ?? [];
      emit(s, 'transcript_full', { transcript, summary: data?.analysis?.transcript_summary });
      if (!s.recap) await toolFinalize(s, undefined, undefined, data?.analysis?.transcript_summary);
      setStatus(s, 'ended');
    }
    res.json({ ok: true });
  });

  // ---------------- Inbound texts via Photon ----------------
  startInboundPolling(handleInboundText);
}

function resolveSession(id: unknown): Session | undefined {
  // Fallback to the newest session covers inbound calls where no session_id was injected.
  return getSession(typeof id === 'string' ? id : undefined) ?? latestSession();
}

async function handleInboundText(t: InboundText) {
  const s = latestSessionForPhone(t.phone);
  const word = t.text.trim().toUpperCase();
  if (!s) {
    await sendText(t.phone, 'Toyota Financial Services: Thanks for texting! Open The Fast and the Financed and tap "Call me" to get started.', `noact-${t.id}`);
    return;
  }
  addLine(s, { from: 'customer', text: t.text, via: 'text' });
  if (word === 'CALL') {
    if (voiceConfigured().phone) {
      s.channel = 'phone';
      setStatus(s, 'dialing');
      startOutboundCall(s, s.phone!).catch((e) => addLine(s, { from: 'system', text: e.message }));
      await sendText(t.phone, 'Calling you now.', `callack-${t.id}`);
    }
    return;
  }
  if (word === 'ADVISOR' || word === 'HUMAN' || word === 'AGENT') {
    toolRequestHuman(s, 'Customer texted ADVISOR after the call', 'normal');
    await sendText(t.phone, 'Got it. A Toyota specialist has your call notes and will reply here shortly.', `advack-${t.id}`);
    return;
  }
  if (s.handoff?.open) return; // a human owns this thread now; it shows in the Advisor console
  try {
    const reply = await claudeTextReply(s);
    if (reply) {
      await sendText(t.phone, reply, `claude-${t.id}`);
      return;
    }
  } catch (e) {
    console.error('[claude] text reply failed', e);
  }
  toolRequestHuman(s, `Customer texted: "${t.text.slice(0, 120)}"`, 'normal');
  await sendText(t.phone, 'Thanks! A Toyota specialist can see our whole conversation and will reply here shortly.', `ack-${t.id}`);
}

function metrics() {
  const ss = allSessions().filter((s) => s.result);
  const rec = (s: Session) => s.result!.options.find((o) => o.id === (s.chosenOptionId || s.result!.recommendedId));
  const resolved = ss.filter((s) => !s.handoff);
  const retained = ss.filter((s) => rec(s)?.businessValue.retention === 'retain');
  const offers = ss.filter((s) => rec(s)?.nextStep.type === 'eligible_offer');
  const termsTaught = ss.reduce((n, s) => n + s.learned.length, 0);
  const avgHandleMin = 11; // assumption: typical lease-end / refinance phone call with a rep
  return {
    conversations: ss.length,
    resolvedSelfService: resolved.length,
    warmHandoffs: ss.length - resolved.length,
    retainedOutcomes: retained.length,
    eligibleOffers: offers.length,
    termsTaught,
    repMinutesSaved: resolved.length * avgHandleMin,
    assumptions: [`${avgHandleMin} min average rep handle time for this kind of call`, 'Counts are from sessions run on this server (synthetic customers)'],
    revenueSignals: ss.map((s) => rec(s)?.businessValue.revenue).filter(Boolean),
  };
}
