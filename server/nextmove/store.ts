/**
 * In-memory session store + realtime fan-out to the browser (Socket.IO).
 * One session = one customer conversation (call, browser voice, or simulation).
 */

import type { Server as SocketIOServer } from 'socket.io';
import { randomUUID } from 'crypto';
import type { Answers, NextMoveResult } from './engine.js';
import type { Term } from './glossary.js';

export type SessionStatus = 'idle' | 'dialing' | 'in_call' | 'analyzing' | 'wrapping_up' | 'ended' | 'failed';
export type Channel = 'phone' | 'browser' | 'simulated';

export interface ChatLine {
  from: 'customer' | 'agent' | 'advisor' | 'system';
  text: string;
  at: string;
  via?: 'voice' | 'text';
}

export interface Session {
  id: string;
  customerId: string | null; // a current customer, once identified
  guest?: { id: string; firstName: string; lastName: string }; // a new customer, once identified
  callerName?: string;
  phone?: string;
  channel?: Channel;
  status: SessionStatus;
  answers: Answers;
  heard: Array<{ label: string; value: string; quote?: string; at: string }>;
  learned: Term[];
  result?: NextMoveResult;
  chosenOptionId?: string;
  nextStepLabel?: string;
  handoff?: { reason: string; urgency: string; at: string; open: boolean };
  recap?: { text: string; delivered: boolean; via: string; error?: string; at: string };
  conversationId?: string;
  transcriptSeen?: number; // how many transcript turns from ElevenLabs are already shown
  endedReason?: string;
  lines: ChatLine[]; // transcript + texts + advisor messages
  createdAt: string;
  endedAt?: string;
}

const sessions = new Map<string, Session>();
let io: SocketIOServer | null = null;

export function attachIO(server: SocketIOServer) {
  io = server;
  server.on('connection', (socket) => {
    socket.on('nm:join', (sessionId: string) => {
      if (typeof sessionId === 'string') socket.join(`nm:${sessionId}`);
      const s = sessions.get(sessionId);
      if (s) socket.emit('nm:session', s);
    });
    socket.on('nm:leave', (sessionId: string) => socket.leave(`nm:${sessionId}`));
    socket.on('nm:advisor', () => {
      socket.join('nm:advisors');
      socket.emit('nm:handoffs', listHandoffs());
    });
  });
}

export function createSession(customerId: string | null = null): Session {
  const s: Session = {
    id: randomUUID().slice(0, 8),
    customerId,
    status: 'idle',
    answers: {},
    heard: [],
    learned: [],
    lines: [],
    createdAt: new Date().toISOString(),
  };
  sessions.set(s.id, s);
  return s;
}

export function getSession(id: string | undefined | null): Session | undefined {
  return id ? sessions.get(id) : undefined;
}

export function allSessions(): Session[] {
  return [...sessions.values()];
}

export function latestSessionForPhone(phone: string): Session | undefined {
  const norm = normalizePhone(phone);
  return allSessions()
    .filter((s) => s.phone && normalizePhone(s.phone) === norm)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function latestSession(): Session | undefined {
  return allSessions().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function listHandoffs() {
  return allSessions()
    .filter((s) => s.handoff)
    .sort((a, b) => (b.handoff!.at).localeCompare(a.handoff!.at));
}

/** Push an incremental event and the full session to the session room. */
export function emit(s: Session, type: string, data: unknown = {}) {
  if (!io) return;
  io.to(`nm:${s.id}`).emit('nm:event', { type, data, at: new Date().toISOString() });
  io.to(`nm:${s.id}`).emit('nm:session', s);
  if (s.handoff) io.to('nm:advisors').emit('nm:handoffs', listHandoffs());
  io.emit('nm:metrics-dirty');
}

export function addLine(s: Session, line: Omit<ChatLine, 'at'>) {
  const full = { ...line, at: new Date().toISOString() };
  s.lines.push(full);
  emit(s, 'line', full);
}

export function setStatus(s: Session, status: SessionStatus) {
  s.status = status;
  if (status === 'ended' || status === 'failed') s.endedAt = new Date().toISOString();
  emit(s, 'status', { status });
}

export function normalizePhone(p: string): string {
  const digits = p.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits;
}
