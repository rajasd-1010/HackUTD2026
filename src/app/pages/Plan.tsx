import React, { useEffect, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { Icon } from '../../components/nm/icons';
import { topicForTerm } from '../../components/nm/learnContent';
import { money } from '../../lib/api';
import { useApp, type MoveOption } from '../state';
import { go, Journey } from '../Shell';

export function Plan() {
  const { session, who, choose } = useApp();
  const options = session?.result?.options ?? [];
  const chosenId = session?.chosenOptionId || session?.result?.recommendedId;
  const best = options.find((o) => o.id === chosenId) ?? options[0];
  const rest = options.filter((o) => o.id !== best?.id);

  if (!best) {
    return (
      <div className="page">
        <div className="panel empty">
          <Icon name="plan" />
          <h1 className="display d3">Your plan shows up here after your call</h1>
          <p className="lead" style={{ margin: '12px auto 24px' }}>It takes about 3 minutes. We'll compare your choices side by side in plain words.</p>
          <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            <a className="btn btn-red" href="#/call"><Icon name="phone" /> Start a call</a>
            <a className="btn btn-ghost" href="#/learn">Learn the basics first</a>
          </div>
        </div>
      </div>
    );
  }

  const isPick = best.id === session?.chosenOptionId && best.id !== session?.result?.recommendedId;

  return (
    <div className="page stack" style={{ gap: 32 }}>
      <Journey at="plan" />
      <div>
        <h1 className="display d2">{who.kind !== 'unknown' ? `${who.name.split(' ')[0]}'s plan` : 'Your plan'}</h1>
        <p className="lead" style={{ marginTop: 12 }}>Based on your account and what you told us. These are estimates, not offers.</p>
      </div>

      <AnimatePresence mode="wait">
        <motion.section key={best.id} className="best" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }} aria-label="Your best option">
          <div className="best-main">
            {best.recommended ? <span className="badge badge-red"><Icon name="spark" style={{ width: 16, height: 16 }} /> Best fit for you</span> : isPick ? <span className="badge badge-go">Your pick</span> : null}
            <h2 className="display d3">{best.title}</h2>
            <p className="muted" style={{ fontSize: 18 }}>{best.plain}</p>
            {best.overBudget && <span className="badge badge-warn">A little over the budget you mentioned</span>}
            <Details o={best} />
          </div>
          <div className="best-side on-dark">
            {best.monthlyPayment !== null ? (
              <>
                <span className="price num"><CountUp value={best.monthlyPayment} /></span>
                <span style={{ color: 'rgba(255,255,255,.7)' }}>{best.monthlyPayment === 0 ? 'no monthly payment' : 'about this much a month'}</span>
              </>
            ) : (
              <span className="display d3">No numbers yet</span>
            )}
            <span className="good-news" style={{ fontSize: 18 }}>{best.impactLabel}</span>
            <div style={{ marginTop: 10 }}>
              <p style={{ color: 'rgba(255,255,255,.7)', fontSize: 14 }}>Your next step</p>
              <p style={{ fontWeight: 700, fontSize: 18 }}>{best.nextStep.label}</p>
            </div>
            {best.nextStep.type === 'human_advisor' ? (
              <button className="btn btn-red" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={() => go('help')}>Talk to a person</button>
            ) : session?.chosenOptionId === best.id ? (
              <span className="badge badge-go" style={{ marginTop: 6 }}>This is your plan</span>
            ) : (
              <button className="btn btn-red" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={() => choose(best.id)}>Make this my plan</button>
            )}
          </div>
        </motion.section>
      </AnimatePresence>

      {rest.length > 0 && (
        <section aria-labelledby="other-h">
          <h2 id="other-h" className="display d3" style={{ marginBottom: 16 }}>Other choices</h2>
          <motion.div className="others" layout>
            {rest.map((o) => <Other key={o.id} o={o} onChoose={() => choose(o.id)} />)}
          </motion.div>
        </section>
      )}

      {session?.result?.notes?.map((n) => (
        <div key={n} className="insight"><span className="dot tone-warn"><Icon name="alert" /></span><b>{n}</b></div>
      ))}

      {!!session?.learned.length && (
        <section aria-labelledby="learned-h">
          <h2 id="learned-h" className="display d3" style={{ marginBottom: 16 }}>Words we explained</h2>
          <div className="terms">
            {session.learned.map((t) => {
              const topic = topicForTerm(t.key);
              return (
                <motion.div key={t.key} className="term" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
                  <b>{t.term}</b>
                  <p style={{ marginTop: 6 }}>{t.short}</p>
                  <p className="small" style={{ marginTop: 6 }}>Think of it like this: {t.analogy}</p>
                  {topic && <a className="link" style={{ display: 'inline-block', marginTop: 10 }} href="#/learn" onClick={() => sessionStorage.setItem('nm_topic', topic.id)}>Learn more about {topic.title.toLowerCase().replace('?', '')}</a>}
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {session?.recap && (
        <section className="panel" aria-labelledby="recap-h">
          <div className="between" style={{ marginBottom: 16 }}>
            <h2 id="recap-h" className="h4">The text we sent you</h2>
            <span className={`badge ${session.recap.delivered ? 'badge-go' : 'badge-gray'}`}>{session.recap.delivered ? 'Delivered to your phone' : 'Shown here only'}</span>
          </div>
          <div className="sms">{session.recap.text}</div>
          <p className="small" style={{ marginTop: 14 }}>Reply to that text anytime. Our AI answers, or a real person if you ask.</p>
        </section>
      )}
    </div>
  );
}

function Other({ o, onChoose }: { o: MoveOption; onChoose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div layout className={`other ${open ? 'open' : ''}`}>
      <button className="other-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>
          <b style={{ fontSize: 19 }}>{o.title}</b>
          <span className="muted" style={{ display: 'block', fontSize: 15, marginTop: 2 }}>{o.impactLabel}</span>
        </span>
        <span className="row">
          <span className="num">{o.monthlyPayment === null ? '' : money(o.monthlyPayment)}{o.monthlyPayment !== null && <span className="small" style={{ fontWeight: 500 }}>/mo</span>}</span>
          <Icon name="chevron" className="chev" />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
            <div className="other-body">
              <p className="muted">{o.plain}</p>
              {o.overBudget && <span className="badge badge-warn">Over the budget you mentioned</span>}
              <Details o={o} />
              <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={onChoose}>Make this my plan</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Details({ o }: { o: MoveOption }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button className="link" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? 'Hide the details' : 'Good and bad, and how we got the number'}</button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
            <div className="pc" style={{ marginTop: 14 }}>
              <div><b>The good</b><ul>{o.pros.map((p) => <li key={p}>{p}</li>)}</ul></div>
              <div><b>Keep in mind</b><ul>{o.cons.map((p) => <li key={p}>{p}</li>)}</ul></div>
            </div>
            <div className="well" style={{ marginTop: 12, fontSize: 14 }}>
              <b>How we got this:</b> {o.assumptions.join('. ')}.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CountUp({ value }: { value: number }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `$${Math.round(v).toLocaleString('en-US')}`);
  useEffect(() => {
    const c = animate(mv, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [value, mv]);
  return <motion.span>{text}</motion.span>;
}
