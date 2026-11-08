/**
 * App-wide state: the demo account, the live conversation session, and the actions
 * (call, demo, browser voice). Every page reads from here, so a call keeps running
 * while the user moves between sections.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { api, API_ORIGIN } from '../lib/api';

export interface Customer {
  id: string; code: string; firstName: string; lastName: string; city: string; avatar: string;
  vehicle: { year: number; model: string; trim: string; color: string; odometer: number; estMarketValue: number; mpg: number; fuelType: string };
  contract: {
    type: 'lease' | 'loan'; startDate: string; termMonths: number; monthsRemaining: number; monthlyPayment: number; apr: number;
    payoffAmount: number; residualValue?: number; mileageAllowancePerYear?: number; excessMileFee?: number;
  };
  service: { toyotaCareMonthsLeft: number; openRecalls: number };
}
export interface MoveOption {
  id: string; kind: string; title: string; headline: string; monthlyPayment: number | null; upfrontCost: number | null;
  impactLabel: string; impactValue: number; pros: string[]; cons: string[]; plain: string; assumptions: string[]; terms: string[];
  nextStep: { type: string; label: string }; businessValue: { retention: string; revenue: string | null; serviceEffort: string };
  requiresHuman?: boolean; overBudget?: boolean; recommended?: boolean;
}
export interface Term { key: string; term: string; short: string; analogy: string; whyItMatters: string }
export interface Line { from: 'customer' | 'agent' | 'advisor' | 'system'; text: string; via?: string; at: string }
export interface Session {
  id: string; customerId: string | null; guest?: { id: string; firstName: string; lastName: string }; callerName?: string; endedReason?: string; phone?: string; channel?: 'phone' | 'browser' | 'simulated';
  status: 'idle' | 'dialing' | 'in_call' | 'analyzing' | 'wrapping_up' | 'ended' | 'failed';
  heard: Array<{ label: string; value: string; quote?: string }>;
  learned: Term[];
  result?: { options: MoveOption[]; recommendedId: string | null; notes: string[]; situation: Record<string, string | number> };
  chosenOptionId?: string;
  handoff?: { reason: string; urgency: string; open: boolean; at: string };
  recap?: { text: string; delivered: boolean; via: string; error?: string };
  lines: Line[];
}
export interface Config { voice: { phone: boolean; browser: boolean }; texting: boolean; claude: boolean; photonNumber: string | null }

interface Ctx {
  customers: Customer[];
  customer: Customer | null;
  config: Config | null;
  session: Session | null;
  learned: Term[];
  live: boolean;
  phone: string; setPhone: (p: string) => void;
  consent: boolean; setConsent: (v: boolean) => void;
  busy: boolean;
  error: string | null; setError: (e: string | null) => void;
  browserLive: boolean; agentSpeaking: boolean;
  pickCustomer: (id: string) => Promise<void>;
  callMe: () => Promise<boolean>;
  startOver: () => Promise<void>;
  demoCall: (customerId?: string) => Promise<string | undefined>;
  talkInBrowser: () => Promise<void>;
  hangUp: () => Promise<void>;
  choose: (optionId: string) => void;
  askForPerson: (note?: string, phone?: string) => Promise<void>;
  /** Who the session belongs to, for display. */
  who: { kind: 'customer'; name: string; ref: string } | { kind: 'guest'; name: string; ref: string } | { kind: 'unknown' };
}

const C = createContext<Ctx | null>(null);
export const useApp = () => {
  const v = useContext(C);
  if (!v) throw new Error('useApp outside provider');
  return v;
};

const LIVE: Session['status'][] = ['dialing', 'in_call', 'analyzing', 'wrapping_up'];
const read = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [learned, setLearned] = useState<Term[]>(() => { try { return JSON.parse(read('nm_learned', '[]')); } catch { return []; } });
  const [phone, setPhoneState] = useState(() => read('nm_phone', ''));
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browserConv, setBrowserConv] = useState<any>(null);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const sock = useRef<Socket | null>(null);
  const joined = useRef<string | null>(null);

  const setPhone = (p: string) => { setPhoneState(p); write('nm_phone', p); };

  const join = (s: Session) => {
    if (joined.current && joined.current !== s.id) sock.current?.emit('nm:leave', joined.current);
    joined.current = s.id;
    sock.current?.emit('nm:join', s.id);
    setSession(s);
    write('nm_session', s.id);
  };

  useEffect(() => {
    api<Config>('/nm/config').then(setConfig).catch(() => setError("Can't reach the server. Start it with npm run server, then refresh."));
    api<Customer[]>('/nm/customers').then(setCustomers).catch(() => {});
    const s = io(API_ORIGIN);
    sock.current = s;
    s.on('connect', () => { if (joined.current) s.emit('nm:join', joined.current); });
    s.on('nm:session', (d: Session) => { if (d.id === joined.current) setSession(d); });
    // Resume: a recap link (?session=) or the last session in this browser
    const deep = new URLSearchParams(window.location.search).get('session') || read('nm_session', '');
    if (deep) api<Session>(`/nm/sessions/${deep}`).then(join).catch(() => {});
    return () => { s.close(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Nothing resumed: start an anonymous session. The call itself finds out who this is.
  useEffect(() => {
    const t = setTimeout(() => { if (!joined.current) void newSession(null); }, 500);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Everything explained on a call is kept for the Learn section
  useEffect(() => {
    if (!session?.learned.length) return;
    setLearned((prev) => {
      const merged = [...prev];
      for (const t of session.learned) if (!merged.some((x) => x.key === t.key)) merged.push(t);
      write('nm_learned', JSON.stringify(merged));
      return merged;
    });
  }, [session?.learned.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const newSession = useCallback(async (customerId: string | null) => {
    const s = await api<Session>('/nm/sessions', { method: 'POST', body: JSON.stringify(customerId ? { customerId } : {}) });
    join(s);
    return s;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pickCustomer = async (id: string) => { setError(null); await newSession(id); };
  const freshFor = async (customerId: string | null) => (session && session.status === 'idle' && !session.lines.length && session.customerId === customerId && !session.guest ? session : newSession(customerId));

  const callMe = async () => {
    setBusy(true); setError(null);
    try {
      // Every call gets its own fresh session, so a new number never reuses an old call.
      const s = session && session.status === 'idle' && !session.lines.length && !session.phone ? session : await newSession(null);
      await api(`/nm/sessions/${s.id}/call`, { method: 'POST', body: JSON.stringify({ phone, consent }) });
      return true;
    } catch (e) { setError((e as Error).message); return false; }
    finally { setBusy(false); }
  };

  const demoCall = async (customerId?: string) => {
    setError(null);
    const id = customerId ?? (session?.customerId || customers[0]?.id);
    if (!id) return;
    const s = await freshFor(id);
    await api(`/nm/sessions/${s.id}/simulate`, { method: 'POST', body: JSON.stringify({ phone }) });
    return s.id;
  };

  const talkInBrowser = async () => {
    setBusy(true); setError(null);
    try {
      const s = await freshFor(null);
      const { signedUrl, dynamicVariables } = await api<{ signedUrl: string; dynamicVariables: Record<string, string | number> }>(`/nm/sessions/${s.id}/browser-voice`);
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const { Conversation } = await import('@elevenlabs/client');
      await api(`/nm/sessions/${s.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'in_call' }) });
      const conv = await Conversation.startSession({
        signedUrl,
        connectionType: 'websocket',
        dynamicVariables,
        onMessage: ({ message, source }: { message: string; source: 'user' | 'ai' }) => {
          api(`/nm/sessions/${s.id}/line`, { method: 'POST', body: JSON.stringify({ from: source === 'user' ? 'customer' : 'agent', text: message }) }).catch(() => {});
        },
        onModeChange: ({ mode }: { mode: string }) => setAgentSpeaking(mode === 'speaking'),
        onDisconnect: () => {
          setBrowserConv(null);
          api(`/nm/sessions/${s.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'ended' }) }).catch(() => {});
        },
        onError: (m: unknown) => setError(String(m)),
      } as any);
      setBrowserConv(conv);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const startOver = async () => { setError(null); await newSession(null); };

  const hangUp = async () => { await browserConv?.endSession?.(); setBrowserConv(null); };

  const choose = (optionId: string) => {
    if (session) api(`/nm/sessions/${session.id}/choose`, { method: 'POST', body: JSON.stringify({ optionId }) }).catch(() => {});
  };

  const askForPerson = async (note?: string, phoneNumber?: string) => {
    if (!session) return;
    await api(`/nm/sessions/${session.id}/handoff`, { method: 'POST', body: JSON.stringify({ note, phone: phoneNumber || session.phone || phone }) });
  };

  const customer = useMemo(() => customers.find((c) => c.id === session?.customerId) ?? null, [customers, session?.customerId]);
  const live = !!session && LIVE.includes(session.status);
  const who: Ctx['who'] = customer
    ? { kind: 'customer', name: `${customer.firstName} ${customer.lastName}`, ref: customer.code }
    : session?.guest
      ? { kind: 'guest', name: `${session.guest.firstName} ${session.guest.lastName}`.trim(), ref: session.guest.id }
      : { kind: 'unknown' };

  return (
    <C.Provider value={{
      customers, customer, config, session, learned, live, phone, setPhone, consent, setConsent, busy, error, setError,
      browserLive: !!browserConv, agentSpeaking, who, pickCustomer, callMe, demoCall, talkInBrowser, hangUp, choose, askForPerson, startOver,
    }}>
      {children}
    </C.Provider>
  );
}
