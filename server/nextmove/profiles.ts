/**
 * Who is on the call: a current customer (found by customer code), a new customer
 * (gets a fresh ID on the spot), or nobody yet (before the agent asks).
 */

import { customers, type CustomerProfile } from './customers.js';
import type { Session } from './store.js';

export interface Guest {
  id: string; // e.g. NEW-4827
  firstName: string;
  lastName: string;
  createdAt: string;
}

const guests = new Map<string, Guest>();

const digits = (s: string) => (s || '').replace(/\D/g, '');

/** Match a spoken or typed code ("TM-4821", "tm 4821", "four eight two one") to a demo customer. */
export function findByCode(code: string): CustomerProfile | undefined {
  const d = digits(wordsToDigits(code));
  if (d.length < 4) return undefined;
  return customers.find((c) => digits(c.code) === d.slice(-4));
}

const WORDS: Record<string, string> = { zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9' };
function wordsToDigits(s: string) {
  return (s || '').toLowerCase().replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/g, (w) => WORDS[w]);
}

export function createGuest(fullName: string): Guest {
  const [first, ...rest] = (fullName || 'Guest').trim().split(/\s+/);
  let id = '';
  do { id = `NEW-${Math.floor(1000 + Math.random() * 9000)}`; } while (guests.has(id) || customers.some((c) => digits(c.code) === digits(id)));
  const g: Guest = { id, firstName: cap(first), lastName: rest.map(cap).join(' '), createdAt: new Date().toISOString() };
  guests.set(id, g);
  return g;
}

export function getGuest(id?: string | null) {
  return id ? guests.get(id) : undefined;
}

const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1) : w);

export type Who =
  | { kind: 'customer'; c: CustomerProfile }
  | { kind: 'guest'; g: Guest }
  | { kind: 'unknown' };

export function whoOf(s: Session): Who {
  if (s.customerId) {
    const c = customers.find((x) => x.id === s.customerId);
    if (c) return { kind: 'customer', c };
  }
  const g = getGuest(s.guest?.id);
  if (g) return { kind: 'guest', g };
  return { kind: 'unknown' };
}

export function firstNameOf(s: Session): string {
  const w = whoOf(s);
  if (w.kind === 'customer') return w.c.firstName;
  if (w.kind === 'guest') return w.g.firstName;
  return s.callerName?.split(' ')[0] || 'there';
}

/** The ID the customer would quote back to us. */
export function refOf(s: Session): string | null {
  const w = whoOf(s);
  if (w.kind === 'customer') return w.c.code;
  if (w.kind === 'guest') return w.g.id;
  return null;
}
