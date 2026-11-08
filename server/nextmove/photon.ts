/**
 * Photon 2.0 messaging: send the post-call recap by text, relay human-advisor replies,
 * and poll for inbound texts (CALL = call me back, ADVISOR = talk to a person).
 *
 * Docs: https://photon.codes/docs/beta  (client: @photon-ai/api, Node 22+)
 */

import { Photon, ApiError } from '@photon-ai/api';
import { normalizePhone } from './store.js';

const cfg = () => ({
  apiKey: process.env.PHOTON_API_KEY || '',
  projectId: process.env.PHOTON_PROJECT_ID || '',
  number: process.env.PHOTON_NUMBER ? normalizePhone(process.env.PHOTON_NUMBER) : '',
  platform: (process.env.PHOTON_PLATFORM || 'sms') as 'sms' | 'imessage',
});

export function photonConfigured() {
  const c = cfg();
  return Boolean(c.apiKey && c.projectId && c.number);
}

let client: Photon | null = null;
function photon(): Photon {
  if (!client) client = new Photon({ headers: { Authorization: `Bearer ${cfg().apiKey}` } });
  return client;
}

const userIds = new Map<string, string>(); // handle -> Photon user id
const spaceIds = new Map<string, string>(); // customer phone -> space id
let agentUserId: string | null = null;

async function userIdFor(handle: string): Promise<string> {
  const cached = userIds.get(handle);
  if (cached) return cached;
  const { projectId, platform } = cfg();
  const user: any = await photon().projects.createOrGetUser({ path: { id: projectId }, body: { handle, platform } } as any);
  const id = user?.id ?? user?.user?.id;
  if (!id) throw new Error('Photon did not return a user id');
  userIds.set(handle, id);
  return id;
}

async function agentId(): Promise<string> {
  if (!agentUserId) agentUserId = await userIdFor(cfg().number);
  return agentUserId;
}

async function spaceFor(phone: string): Promise<string> {
  const cached = spaceIds.get(phone);
  if (cached) return cached;
  const { projectId, platform } = cfg();
  const [a, u] = await Promise.all([agentId(), userIdFor(phone)]);
  const space: any = await photon().projects.createOrGetSpace({
    path: { id: projectId },
    headers: { 'idempotency-key': `nextmove-space-${platform}-${phone.replace('+', '')}` },
    body: { participantIds: [a, u], platform },
  } as any);
  const id = space?.id ?? space?.space?.id;
  if (!id) throw new Error('Photon did not return a space id');
  spaceIds.set(phone, id);
  return id;
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

export async function sendText(toPhone: string, text: string, key: string): Promise<SendResult> {
  if (!photonConfigured()) return { ok: false, error: 'Photon not configured (set PHOTON_API_KEY, PHOTON_PROJECT_ID, PHOTON_NUMBER)' };
  const phone = normalizePhone(toPhone);
  try {
    const { projectId } = cfg();
    const spaceId = await spaceFor(phone);
    await photon().projects.sendMessage({
      path: { id: projectId },
      headers: { 'idempotency-key': key.slice(0, 200) },
      body: { spaceId, senderId: await agentId(), content: { type: 'text', format: 'plain', text } },
    } as any);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof ApiError ? `${e.status} ${e.message}` : (e as Error).message;
    console.error('[photon] send failed:', msg, e instanceof ApiError ? JSON.stringify(e.body) : '');
    return { ok: false, error: msg };
  }
}

/** Remember a space we learned about from an inbound message so replies don't need a lookup. */
function remember(phone: string, spaceId?: string, userId?: string) {
  if (spaceId) spaceIds.set(phone, spaceId);
  if (userId) userIds.set(phone, userId);
}

export interface InboundText {
  id: string;
  phone: string;
  text: string;
}

let pollTimer: NodeJS.Timeout | null = null;
const seen = new Set<string>();

/** Poll Photon for inbound texts. Simple and needs no public webhook URL. */
export function startInboundPolling(onText: (t: InboundText) => void, everyMs = 4000) {
  if (!photonConfigured() || pollTimer) return;
  let since = new Date().toISOString();
  const tick = async () => {
    try {
      const { projectId, platform } = cfg();
      const page: any = await photon().projects.listMessages({
        path: { id: projectId },
        query: { direction: 'received', platform, createdSince: since, order: 'asc', pageSize: 50 },
      } as any);
      for (const m of page?.items ?? []) {
        if (!m?.id || seen.has(m.id)) continue;
        seen.add(m.id);
        if (m.createdAt && m.createdAt > since) since = m.createdAt;
        const text = m?.content?.type === 'text' ? m.content.text : null;
        const handle = m?.sentBy?.handle;
        if (!text || !handle) continue;
        const phone = normalizePhone(handle);
        remember(phone, m?.space?.id, m?.sentBy?.id);
        onText({ id: m.id, phone, text });
      }
    } catch (e) {
      console.error('[photon] poll failed:', (e as Error).message);
    }
  };
  pollTimer = setInterval(tick, everyMs);
  console.log(`📨 Photon inbound polling every ${everyMs / 1000}s on ${cfg().number}`);
}
