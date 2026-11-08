import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, API_ORIGIN, money } from '../../lib/api';
import { Icon } from '../../components/nm/icons';
import { useApp, type Session } from '../state';

interface Metrics { conversations: number; resolvedSelfService: number; warmHandoffs: number; retainedOutcomes: number; eligibleOffers: number; termsTaught: number; repMinutesSaved: number; assumptions: string[] }

/** Toyota-side view: business impact, setup status, and the human handoff queue. */
export function Staff() {
  const { config, customers, demoCall } = useApp();
  const [items, setItems] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = () => api<Metrics>('/nm/metrics').then(setMetrics).catch(() => {});
    load();
    api<Session[]>('/nm/advisor/handoffs').then(setItems).catch(() => {});
    const s = io(API_ORIGIN);
    s.on('connect', () => s.emit('nm:advisor'));
    s.on('nm:handoffs', setItems);
    s.on('nm:metrics-dirty', load);
    return () => { s.close(); };
  }, []);

  const active = items.find((x) => x.id === activeId) ?? items[0];
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [active?.lines.length]);
  const rec = active?.result?.options.find((o) => o.id === active.result?.recommendedId);

  const send = async () => {
    if (!active || !draft.trim()) return;
    const r = await api<{ delivered: boolean; error?: string }>(`/nm/advisor/${active.id}/reply`, { method: 'POST', body: JSON.stringify({ text: draft }) });
    setNote(r.delivered ? 'Texted to the customer.' : `Saved to the conversation. Not texted: ${r.error}`);
    setDraft('');
  };

  return (
    <div className="page stack" style={{ gap: 32 }}>
      <div>
        <h1 className="display d2"><span className="staff-hl">Toyota staff</span> view</h1>
        <p className="lead" style={{ marginTop: 12 }}>What the AI is doing for customers, and the conversations that need a person.</p>
      </div>

      <section className="panel stack" aria-labelledby="demo">
        <h2 id="demo" className="h4">Demo customers</h2>
        <div className="stack" style={{ gap: 10 }}>
          {customers.map((c) => (
            <div key={c.id} className="well between">
              <div className="row" style={{ gap: 14, flex: '1 1 320px', minWidth: 0 }}>
                <span style={{ fontSize: 28 }} aria-hidden="true">{c.avatar}</span>
                <div style={{ minWidth: 0 }}>
                  <b>{c.firstName} {c.lastName}</b>
                  <p className="muted" style={{ fontSize: 14 }}>{c.vehicle.year} {c.vehicle.model} {c.vehicle.trim} · {c.contract.type === 'lease' ? 'Lease' : 'Loan'}, {c.contract.monthsRemaining} months left</p>
                </div>
              </div>
              <div className="row" style={{ gap: 12 }}>
                <span className="num" style={{ fontSize: 22 }}>{c.code}</span>
                <button className="btn btn-sm" onClick={async () => { const id = await demoCall(c.id); if (id) window.open(`/?session=${id}#/call`, '_blank'); }}>Play demo call</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {metrics && (
        <section aria-labelledby="impact">
          <h2 id="impact" className="h4" style={{ marginBottom: 14 }}>Impact so far</h2>
          <div className="kpis">
            <div><span className="num">{metrics.conversations}</span><span className="small">customers guided</span></div>
            <div><span className="num">{metrics.retainedOutcomes}</span><span className="small">stayed with Toyota</span></div>
            <div><span className="num">{metrics.eligibleOffers}</span><span className="small">offers they qualify for</span></div>
            <div><span className="num">{metrics.repMinutesSaved}</span><span className="small">rep minutes saved</span></div>
            <div><span className="num">{metrics.warmHandoffs}</span><span className="small">handed to a person with full context</span></div>
          </div>
          <p className="small" style={{ marginTop: 10 }}>Assumes {metrics.assumptions[0]}. {metrics.termsTaught} money words explained to customers.</p>
        </section>
      )}

      <section aria-labelledby="queue">
        <h2 id="queue" className="h4" style={{ marginBottom: 14 }}>Needs a person</h2>
        {items.length === 0 ? (
          <div className="panel empty"><Icon name="headset" /><p className="lead" style={{ margin: '0 auto' }}>Nobody's waiting. On a call, say money is tight or ask for a person.</p></div>
        ) : (
          <div className="grid-call">
            <div className="stack" style={{ gap: 10 }}>
              {items.map((x) => (
                <button key={x.id} className={`queue-item ${active?.id === x.id ? 'active' : ''}`} onClick={() => setActiveId(x.id)}>
                  <div className="between"><b>{x.guest ? `${x.guest.firstName} ${x.guest.lastName}`.trim() : x.customerId ? x.customerId[0].toUpperCase() + x.customerId.slice(1) : x.callerName || 'Unknown caller'}</b>
                    <span className={`badge ${x.handoff?.open ? (x.handoff.urgency === 'high' ? 'badge-red' : 'badge-warn') : 'badge-go'}`} style={{ padding: '3px 10px', fontSize: 12 }}>{x.handoff?.open ? (x.handoff.urgency === 'high' ? 'Urgent' : 'Waiting') : 'Done'}</span></div>
                  <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>{x.handoff?.reason}</p>
                </button>
              ))}
            </div>
            {active && (
              <div className="panel stack" style={{ gap: 18 }}>
                <div className="between"><h3 className="h4">What the AI learned</h3><span className="small">{active.guest ? `New customer ${active.guest.id} · ` : ''}{active.phone ?? 'No phone on file'}</span></div>
                <div className="heard">{active.heard.map((h, i) => <div key={i} className="heard-chip"><span>{h.label}</span><b>{h.value}</b></div>)}</div>
                {rec && <div className="well"><span className="small">AI's suggestion</span><br /><b>{rec.title}</b>{rec.monthlyPayment !== null ? `, ${money(rec.monthlyPayment)}/mo` : ''}. {rec.impactLabel}</div>}
                <div className="convo" ref={box}>
                  {active.lines.map((l, i) => (
                    <div key={i} className={`bubble ${l.from}`}>
                      {l.from !== 'system' && <small>{l.from === 'agent' ? 'Toyota AI' : l.from === 'advisor' ? 'You' : 'Customer'}{l.via === 'text' ? ' (text)' : l.via === 'voice' ? ' (call)' : ''}</small>}
                      {l.text}
                    </div>
                  ))}
                </div>
                <textarea className="input" rows={3} placeholder="Hi, this is Jordan from Toyota. I can move your due date to the 5th. Want me to do that?" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Reply to customer" />
                <div className="between">
                  <button className="link" onClick={() => api(`/nm/advisor/${active.id}/resolve`, { method: 'POST' })}>Mark as done</button>
                  <button className="btn btn-red" onClick={send} disabled={!draft.trim()}><Icon name="msg" /> Text the customer</button>
                </div>
                {note && <p className="small" role="status">{note}</p>}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="setup">
        <h2 id="setup" className="h4" style={{ marginBottom: 14 }}>Setup status</h2>
        <div className="stack" style={{ gap: 10 }}>
          {[
            ['Phone calls', !!config?.voice.phone],
            ['Browser voice', !!config?.voice.browser],
            ['Texting through Photon', !!config?.texting],
            ['Claude answering texts', !!config?.claude],
          ].map(([l, ok]) => (
            <div key={l as string} className="between"><span>{l}</span><span className={`badge ${ok ? 'badge-go' : 'badge-gray'}`}>{ok ? 'On' : 'Not set up'}</span></div>
          ))}
        </div>
      </section>
    </div>
  );
}
