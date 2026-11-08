import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Icon } from '../../components/nm/icons';
import { go } from '../Shell';

const HEADLINE = ["Not", "sure", "what's", "next", "for", "your", "Toyota?"];

const SITUATIONS = [
  { id: 'maya', emo: '🔑', title: 'My lease ends soon', body: 'Keep it, hand it back, or switch to something new?' },
  { id: 'marcus', emo: '💸', title: 'My payment feels too high', body: 'See if you can pay less each month.' },
  { id: 'priya', emo: '🤝', title: "Money's tight this month", body: 'Talk to someone who can help, without judgment.' },
  { id: 'diego', emo: '⛽', title: "I'm driving way more now", body: 'Find out what all those miles are really costing you.' },
];

export function Home() {

  return (
    <>
      <section className="hero on-red">
        <div className="hero-moon" aria-hidden="true" />
        <div className="hero-fade" aria-hidden="true" />
        <div className="hero-inner">
          <div>
            <h1 className="display d1" aria-label={`${HEADLINE.join(' ')} We'll call you.`}>
              {HEADLINE.map((w, i) => (
                <motion.span
                  key={i}
                  aria-hidden="true"
                  style={{ display: 'inline-block', marginRight: '0.22em' }}
                  initial={{ opacity: 0, y: 40, rotate: 4 }}
                  animate={{ opacity: 1, y: 0, rotate: 0 }}
                  transition={{ delay: 0.08 + i * 0.07, type: 'spring', stiffness: 260, damping: 22 }}
                >
                  {w}
                </motion.span>
              ))}
              <motion.span
                aria-hidden="true"
                className="marker"
                style={{ display: 'inline-block', fontSize: '0.92em' }}
                initial={{ opacity: 0, scale: 1.6, rotate: -8 }}
                animate={{ opacity: 1, scale: 1, rotate: -3 }}
                transition={{ delay: 0.65, type: 'spring', stiffness: 300, damping: 14 }}
              >
                We'll call you.
              </motion.span>
            </h1>
            <motion.p className="lead" style={{ marginTop: 28 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>
              Answer a few easy questions on the phone. We do the math and text you a clear plan. No tricks, no jargon, no pressure.
            </motion.p>
            <motion.div className="hero-actions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.05 }}>
              <a className="btn btn-white" href="#/call"><Icon name="phone" /> Get a call</a>
              <a className="btn btn-ghost-white" href="#how" onClick={(e) => { e.preventDefault(); document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' }); }}>How it works</a>
            </motion.div>
            <p className="hero-note">Takes about 3 minutes. You can ask for a real person anytime.</p>
          </div>
          <div className="hero-art">
            <HeroPhone />
          </div>
        </div>
        <Road />
      </section>

      <div className="page" style={{ paddingTop: 72 }}>
        <section aria-labelledby="how">
          <h2 id="how" className="display d2">How it works</h2>
          <div className="steps">
            {[
              ['Pick your car', "We already know your Toyota, your payments and your mileage, so you won't fill out forms."],
              ['Take a short call', 'A friendly AI asks what has changed in your life and what matters to you. Ask "what does that mean?" anytime.'],
              ['Get your plan by text', 'Your options, side by side in plain words, plus one clear next step. Reply to talk to a real person.'],
            ].map(([t, b], i) => (
              <div className="step" key={t}>
                <span className="step-n">{i + 1}</span>
                {i < 2 && <span className="step-line" />}
                <h3 className="h4">{t}</h3>
                <p className="muted" style={{ marginTop: 8 }}>{b}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="sit" style={{ marginTop: 96 }}>
          <h2 id="sit" className="display d2">What's going on with your car?</h2>
          <p className="lead" style={{ marginTop: 14 }}>Whatever it is, it starts the same way: a short call. Pick yours to get started.</p>
          <div className="situations">
            {SITUATIONS.map((s) => (
              <button key={s.id} className="situation" onClick={() => go('call')}>
                <span className="emo" aria-hidden="true">{s.emo}</span>
                <span><b>{s.title}</b><span className="muted">{s.body}</span></span>
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="promise" style={{ marginTop: 96 }}>
          <h2 id="promise" className="display d2">Our promises</h2>
          <div className="promises">
            <div className="promise"><Icon name="user" /><h3 className="h4">We won't ask what we know</h3><p className="muted" style={{ marginTop: 8 }}>Your car, contract and payments are already on file. The call is about you, not paperwork.</p></div>
            <div className="promise"><Icon name="calc" /><h3 className="h4">Real math, no guessing</h3><p className="muted" style={{ marginTop: 8 }}>Every number comes from Toyota's calculators, and we show what it's based on.</p></div>
            <div className="promise"><Icon name="headset" /><h3 className="h4">A person is one text away</h3><p className="muted" style={{ marginTop: 8 }}>If money is tight or you'd rather talk to someone, a Toyota specialist picks up with the full story.</p></div>
          </div>
        </section>

        <section className="band" style={{ marginTop: 96 }}>
          <div>
            <h2 className="display d3">New to car money words?</h2>
            <p className="lead" style={{ marginTop: 12 }}>Short lessons on APR, leases, credit and the true cost of a car, with quick quizzes.</p>
          </div>
          <a className="btn btn-white" href="#/learn"><Icon name="book" /> Start learning</a>
        </section>
      </div>
    </>
  );
}

/** The Supra driving away from you down the road, toward the blood moon. */
function Road() {
  return (
    <div className="road" aria-hidden="true">
      <div className="road-plane"><div className="road-dash" /><div className="road-dash r" /></div>
      <div className="supra-wrap">
        <motion.div
          className="supra"
          initial={{ opacity: 0, scale: 1.7, y: 140 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <img src="/brand/supra-rear.png" alt="" />
          <span className="taillight" style={{ left: '12%' }} />
          <span className="taillight" style={{ right: '12%', animationDelay: '.15s' }} />
        </motion.div>
      </div>
    </div>
  );
}

/** The hero's one big moment: a call that rings, listens, and lands a plan. Loops. */
function HeroPhone() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<0 | 1 | 2>(reduce ? 2 : 0);
  useEffect(() => {
    if (reduce) return;
    const timings = [3200, 5200, 4600];
    const t = setTimeout(() => setPhase((p) => ((p + 1) % 3) as 0 | 1 | 2), timings[phase]);
    return () => clearTimeout(t);
  }, [phase, reduce]);

  const chips = ['Lease ends in 4 months', 'Baby on the way', 'Driving more for work', 'Up to $750 a month'];

  return (
    <motion.div style={{ position: 'relative', zIndex: 2 }} initial={{ opacity: 0, y: 60, rotate: 8 }} animate={{ opacity: 1, y: 0, rotate: 3 }} transition={{ delay: 0.35, type: 'spring', stiffness: 120, damping: 16 }} aria-hidden="true">
      <div className="phone">
        <div className="phone-screen">
          <span className="phone-notch" />
          <AnimatePresence mode="wait">
            {phase === 0 && (
              <motion.div key="ring" style={{ display: 'flex', flexDirection: 'column', flex: 1 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
                <div className="caller">
                  <div className="caller-avatar">
                    {[0, 1, 2].map((i) => (
                      <motion.span key={i} className="ring" initial={{ scale: 1, opacity: 0.7 }} animate={{ scale: 2.1, opacity: 0 }} transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.6, ease: 'easeOut' }} />
                    ))}
                    <motion.span animate={{ rotate: [0, -14, 14, -10, 10, 0] }} transition={{ duration: 0.7, repeat: Infinity, repeatDelay: 0.6 }} style={{ color: '#fff', display: 'grid' }}>
                      <Icon name="phone" />
                    </motion.span>
                  </div>
                  <div className="display" style={{ fontSize: 26 }}>Toyota</div>
                  <p className="small" style={{ marginTop: 6 }}>Financial Services is calling…</p>
                </div>
                <div className="call-btns">
                  <span className="call-btn" style={{ background: '#e3343f' }}><Icon name="x" /></span>
                  <motion.span className="call-btn" style={{ background: 'var(--go)' }} animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 0.9, repeat: Infinity }}><Icon name="phone" /></motion.span>
                </div>
              </motion.div>
            )}
            {phase === 1 && (
              <motion.div key="talk" style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingTop: 30 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="row" style={{ marginBottom: 18 }}><span className="pulse" /><b>On a call · 1:12</b></div>
                <p className="small" style={{ marginBottom: 10 }}>What Toyota heard</p>
                <div>
                  {chips.map((c, i) => (
                    <motion.span key={c} className="mini-chip" initial={{ opacity: 0, scale: 0.6, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.9, type: 'spring', stiffness: 400, damping: 20 }}>{c}</motion.span>
                  ))}
                </div>
                <Wave />
              </motion.div>
            )}
            {phase === 2 && (
              <motion.div key="plan" style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingTop: 30 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p className="small">Messages</p>
                <motion.div className="sms" style={{ marginTop: 10, fontSize: 13 }} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
                  Hi Maya, here's your plan from today's call. Reply anytime with questions.
                </motion.div>
                <motion.div className="mini-plan" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6, type: 'spring', stiffness: 160, damping: 18 }}>
                  <span className="badge badge-red" style={{ fontSize: 12, padding: '4px 10px' }}>Best fit for you</span>
                  <div style={{ fontWeight: 700, marginTop: 10 }}>Switch to a new Grand Highlander Hybrid</div>
                  <div className="num" style={{ fontSize: 40, marginTop: 6 }}>$705<span style={{ fontSize: 15, fontWeight: 500 }}> /month</span></div>
                  <div style={{ color: '#7fe0a6', fontWeight: 700, fontSize: 14 }}>Your RAV4 gives you $3,096 toward it</div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

function Wave() {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', height: 70, marginTop: 'auto', justifyContent: 'center' }}>
      {Array.from({ length: 22 }).map((_, i) => (
        <motion.span key={i} style={{ width: 5, borderRadius: 4, background: 'var(--red)' }} animate={{ height: [8, 18 + ((i * 37) % 42), 10, 26 + ((i * 13) % 30), 8] }} transition={{ duration: 1.3, repeat: Infinity, delay: i * 0.05, ease: 'easeInOut' }} />
      ))}
    </div>
  );
}
