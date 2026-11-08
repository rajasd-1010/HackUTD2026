import React from 'react';
import { motion } from 'framer-motion';
import { Icon } from '../../components/nm/icons';
import { money } from '../../lib/api';
import { useApp, type Customer } from '../state';

export function MyCar() {
  const { customer, who, session } = useApp();

  return (
    <div className="page stack" style={{ gap: 28 }}>
      <div>
        <h1 className="display d2">My car</h1>
        <p className="lead" style={{ marginTop: 12 }}>
          {who.kind === 'customer' ? 'This is what Toyota already knows, so the call can skip straight to what matters.'
            : who.kind === 'guest' ? 'Welcome to Toyota. Here is what you told us so far.'
            : "When we call, we'll ask your name and your customer code. New to Toyota? Just say so and you'll get an ID right on the call."}
        </p>
      </div>

      {who.kind === 'unknown' && (
        <div className="panel empty">
          <Icon name="user" />
          <h2 className="display d3">We'll find your account on the call</h2>
          <p className="lead" style={{ margin: '12px auto 24px' }}>Have your customer code handy. Not a customer yet? That's fine, you'll get an ID during the call.</p>
          <a className="btn btn-red" href="#/call"><Icon name="phone" /> Get a call</a>
        </div>
      )}

      {who.kind === 'guest' && (
        <motion.div className="panel stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="between">
            <div>
              <p className="small">New customer</p>
              <h2 className="display d3" style={{ marginTop: 6 }}>{who.name}</h2>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p className="small">Your customer ID</p>
              <span className="num" style={{ fontSize: 34, color: 'var(--red)' }}>{who.ref}</span>
            </div>
          </div>
          {session?.heard.length ? (
            <div className="heard">{session.heard.map((h, i) => <div key={i} className="heard-chip"><span>{h.label}</span><b>{h.value}</b></div>)}</div>
          ) : <p className="muted">Your answers from the call show up here.</p>}
          <p className="small">Save your ID. Say it next time you call and we'll pick up where you left off.</p>
        </motion.div>
      )}

      {customer && (
        <motion.div key={customer.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="stack" style={{ gap: 28 }}>
          <div className="car-hero">
            <div className="car-art"><CarArt type={customer.vehicle.model} /></div>
            <div className="car-body">
              <div>
                <p className="small">{customer.firstName}'s car · {customer.vehicle.color}</p>
                <h2 className="display d3" style={{ marginTop: 6 }}>{customer.vehicle.year} {customer.vehicle.model}</h2>
                <p className="muted" style={{ marginTop: 6 }}>{customer.vehicle.trim} · {customer.contract.type === 'lease' ? 'Leased' : 'Financed'} through Toyota</p>
              </div>
              <div className="facts">
                <div className="fact"><span className="num">{money(customer.contract.monthlyPayment)}</span><span className="small">you pay each month</span></div>
                <div className="fact"><span className="num">{customer.contract.monthsRemaining}</span><span className="small">{customer.contract.type === 'lease' ? 'months until your lease ends' : 'payments left'}</span></div>
                <div className="fact"><span className="num">{customer.vehicle.odometer.toLocaleString()}</span><span className="small">miles on it</span></div>
                <div className="fact"><span className="num">{money(customer.vehicle.estMarketValue)}</span><span className="small">what it's worth today (estimate)</span></div>
              </div>
              <a className="btn btn-red" href="#/call"><Icon name="phone" /> Talk it through on a call</a>
            </div>
          </div>

          <div>
            <h2 className="display d3">Things we noticed</h2>
            <div className="insights">
              {insights(customer).map((t, i) => (
                <motion.div key={t.text} className="insight" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.08 }}>
                  <span className={`dot tone-${t.tone}`}><Icon name={t.icon} /></span>
                  <div><b>{t.text}</b>{t.sub && <p className="muted" style={{ marginTop: 4, fontSize: 15 }}>{t.sub}</p>}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

    </div>
  );
}

type Insight = { text: string; sub?: string; tone: 'good' | 'warn' | 'info'; icon: string };

/** Plain-language observations from the account. No jargon, no advice yet. */
function insights(c: Customer): Insight[] {
  const k = c.contract;
  const out: Insight[] = [];
  if (k.type === 'lease') {
    const allowed = ((k.mileageAllowancePerYear ?? 12000) * k.termMonths) / 12;
    const perMonth = c.vehicle.odometer / Math.max(1, k.termMonths - k.monthsRemaining);
    const projected = c.vehicle.odometer + perMonth * k.monthsRemaining;
    const over = Math.round(projected - allowed);
    out.push({ text: `Your lease ends in ${k.monthsRemaining} months.`, sub: "That's the right time to decide what's next, before any deadlines.", tone: 'info', icon: 'calendar' });
    if (over > 0) out.push({ text: `You're on track to drive about ${over.toLocaleString()} miles more than your lease allows.`, sub: `If you hand it back, that could cost around ${money(over * (k.excessMileFee ?? 0.25))}. There are ways around it.`, tone: 'warn', icon: 'road' });
    const gap = Math.round(c.vehicle.estMarketValue * (1 - 0.008 * k.monthsRemaining) - (k.residualValue ?? k.payoffAmount));
    if (gap > 0) out.push({ text: `Your car is worth about ${money(gap)} more than the price to buy it from your lease.`, sub: "That's value you could use. We'll explain how on the call.", tone: 'good', icon: 'dollar' });
  } else {
    out.push({ text: `${k.monthsRemaining} payments to go.`, sub: `You'd owe about ${money(k.payoffAmount)} to pay it off today.`, tone: 'info', icon: 'calendar' });
    const equity = c.vehicle.estMarketValue - k.payoffAmount;
    if (equity > 2000) out.push({ text: `Your ${c.vehicle.model} is worth about ${money(equity)} more than you owe.`, sub: 'That can work like a down payment if you ever want something different.', tone: 'good', icon: 'dollar' });
  }
  if (c.service.openRecalls) out.push({ text: 'There is an open recall on your car.', sub: 'The fix is free at any Toyota dealer.', tone: 'warn', icon: 'alert' });
  if (c.service.toyotaCareMonthsLeft > 0 && c.service.toyotaCareMonthsLeft <= 2) out.push({ text: 'Your free maintenance plan ends soon.', sub: 'Book your next service before it runs out.', tone: 'info', icon: 'shield' });
  return out;
}

/** Original, unbranded vehicle drawing. Truck for pickups, SUV for crossovers, sedan otherwise. */
function CarArt({ type }: { type: string }) {
  const kind = /tacoma|tundra/i.test(type) ? 'truck' : /rav4|highlander|4runner/i.test(type) ? 'suv' : 'sedan';
  const body = {
    sedan: 'M40 150 Q48 118 92 112 L150 82 Q170 72 200 72 L270 72 Q300 72 322 92 L356 112 Q392 116 402 132 L404 150 Z',
    suv: 'M40 150 L44 112 Q50 98 78 96 L118 66 Q128 58 146 58 L300 58 Q318 58 330 72 L360 100 Q396 104 402 124 L404 150 Z',
    truck: 'M40 150 L42 110 Q46 98 70 96 L110 64 Q118 56 134 56 L214 56 Q226 56 228 68 L230 98 L396 98 Q404 98 404 108 L404 150 Z',
  }[kind];
  return (
    <motion.svg viewBox="0 0 440 200" initial={{ x: -60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 90, damping: 15 }} aria-hidden="true">
      <ellipse cx="222" cy="178" rx="180" ry="10" fill="rgba(21,23,28,.12)" />
      <path d={body} fill="var(--red)" />
      <path d={kind === 'truck' ? 'M126 70 L210 70 L212 98 L104 98 Z' : kind === 'suv' ? 'M134 72 L300 72 L336 100 L112 100 Z' : 'M160 88 L268 86 Q296 86 314 104 L120 110 Z'} fill="#cfe0f0" />
      {[118, 330].map((x) => (
        <g key={x}>
          <circle cx={x} cy="152" r="28" fill="var(--ink)" />
          <motion.g style={{ originX: `${x}px`, originY: '152px' }} animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: 2, ease: 'easeOut' }}>
            <circle cx={x} cy="152" r="12" fill="#c9ccd3" />
            <rect x={x - 2} y="140" width="4" height="24" fill="var(--ink)" />
          </motion.g>
        </g>
      ))}
    </motion.svg>
  );
}
