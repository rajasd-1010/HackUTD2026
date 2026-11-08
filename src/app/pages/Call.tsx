import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from '../../components/nm/icons';
import { Journey } from '../Shell';
import { useApp } from '../state';

const STATUS: Record<string, string> = {
  idle: 'Ready when you are',
  dialing: 'Calling your phone…',
  in_call: "You're on the call",
  analyzing: 'Working out your options…',
  wrapping_up: 'Sending your plan by text…',
  ended: 'Call finished. Your plan is ready.',
  failed: "The call didn't go through",
};

const normalized = (p: string) => { const d = p.replace(/\D/g, ''); return d.length === 10 ? `+1${d}` : `+${d}`; };

export function Call() {
  const app = useApp();
  const { session, config, live, busy, phone, setPhone, consent, setConsent, error, browserLive, agentSpeaking, who } = app;
  const status = browserLive ? (agentSpeaking ? 'Toyota is talking…' : 'Listening…')
    : session?.status === 'ended' ? (session.result ? 'Call ended. Your plan is ready.' : session.endedReason || 'Call ended.')
    : STATUS[session?.status ?? 'idle'];
  const ringing = session?.status === 'dialing';
  const talking = browserLive || (!!session && ['in_call', 'analyzing', 'wrapping_up'].includes(session.status));
  const hasPlan = !!session?.result?.options.length;
  const canCall = !!config?.voice.phone && consent && phone.replace(/\D/g, '').length >= 10 && !(live && session?.phone === normalized(phone));

  return (
    <div className="page stack" style={{ gap: 28 }}>
      <Journey at="call" />
      <div>
        <h1 className="display d2">{who.kind !== 'unknown' ? `Hi ${who.name.split(' ')[0]}, let's talk.` : "Let's talk."}</h1>
        <p className="lead" style={{ marginTop: 12 }}>We'll ring your phone and ask your name and customer code. No code? No problem, you'll get one. It takes about 3 minutes, and this page fills in as you talk.</p>
      </div>

      {error && <div className="error" role="alert">{error}</div>}

      <AnimatePresence>
        {hasPlan && (
          <motion.div className="ready-bar" initial={{ opacity: 0, y: -10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
            <div className="row"><Icon name="spark" style={{ width: 24, height: 24, color: '#ff6b77' }} /><b style={{ fontSize: 18 }}>{live ? 'Your plan is ready. You can look while you talk.' : 'Your plan is ready.'}</b></div>
            <a className="btn btn-red" href="#/plan">See my plan</a>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid-call">
        <div className="panel stack" style={{ gap: 18 }}>
          <div className="dial">
            <button
              className="dial-btn"
              style={talking ? { background: 'var(--ink)' } : undefined}
              onClick={() => app.callMe()}
              disabled={!canCall || busy}
              aria-label="Call my phone now"
            >
              {ringing && [0, 1, 2].map((i) => (
                <motion.span key={i} className="dial-ring" initial={{ scale: 1, opacity: 0.8 }} animate={{ scale: 1.9, opacity: 0 }} transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.6 }} />
              ))}
              {talking ? <Bars /> : (
                <motion.span animate={ringing ? { rotate: [0, -12, 12, -8, 8, 0] } : { rotate: 0 }} transition={{ duration: 0.7, repeat: ringing ? Infinity : 0, repeatDelay: 0.5 }} style={{ display: 'grid' }}>
                  <Icon name="phone" />
                </motion.span>
              )}
            </button>
          </div>
          <p className="status-line" aria-live="polite">{status}</p>

          <div className="field">
            <label htmlFor="phone">Your mobile number</label>
            <input id="phone" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="(469) 555-0123" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <label className="consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>It's OK for Toyota's AI assistant to call and text me about my account. Reply STOP to opt out.</span>
          </label>
          <button className="btn btn-red btn-block" onClick={() => app.callMe()} disabled={!canCall || busy}>
            <Icon name="phone" /> {session?.status === 'dialing' ? 'Calling…' : 'Call me now'}
          </button>
          {(live || session?.status === 'ended' || session?.status === 'failed') && <button className="link" onClick={() => app.startOver()}>Start a new call</button>}
          {!config?.voice.phone && <p className="small">Phone calls aren't switched on yet. You can talk here in your browser instead.</p>}

          <div className="alt-actions">
            {browserLive ? (
              <button className="btn btn-ghost btn-block" onClick={app.hangUp}><span className="pulse" /> End browser call</button>
            ) : (
              <button className="btn btn-ghost btn-block" onClick={app.talkInBrowser} disabled={busy || live || !config?.voice.browser}><Icon name="mic" /> Talk here in my browser</button>
            )}
          </div>
        </div>

        <div className="stack" style={{ gap: 24 }}>
          <div className="panel">
            <div className="between" style={{ marginBottom: 16 }}>
              <div>
                <h2 className="h4">Conversation</h2>
                <p className="small" style={{ marginTop: 4 }}>
                  {who.kind === 'customer' ? `Talking with ${who.name} · customer ${who.ref}` : who.kind === 'guest' ? `Talking with ${who.name} · new customer ${who.ref}` : session && session.status !== 'idle' ? 'Finding out who you are…' : 'Word for word, as it happens'}
                </p>
              </div>
              {live ? <span className="badge badge-red"><span className="pulse" style={{ background: '#fff' }} /> Live</span>
                : session?.status === 'ended' ? <span className="badge badge-gray">Call ended</span> : null}
            </div>
            {session?.lines.length ? <Conversation /> : <p className="muted">Everything Toyota says and everything you say shows up here as you talk, like a chat.</p>}
          </div>

          <div className="panel">
            <div className="between" style={{ marginBottom: 16 }}>
              <h2 className="h4">What we've heard so far</h2>
            </div>
            {session?.heard.length ? (
              <div className="heard">
                <AnimatePresence>
                  {session.heard.map((h, i) => (
                    <motion.div layout key={`${h.label}-${i}`} className="heard-chip" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 24 }}>
                      <span>{h.label}</span><b>{h.value}</b>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <p className="muted">As you answer, the important bits show up here, like what's changed and what you're comfortable paying.</p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

function Bars() {
  return (
    <span style={{ display: 'flex', gap: 4, alignItems: 'center', height: 50, position: 'relative', zIndex: 2 }} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.span key={i} style={{ width: 6, borderRadius: 4, background: '#fff' }} animate={{ height: [10, 34 - i * 3, 14, 40 - (i % 2) * 14, 10] }} transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.12 }} />
      ))}
    </span>
  );
}

function Conversation() {
  const { session } = useApp();
  const box = useRef<HTMLDivElement>(null);
  const n = session?.lines.length ?? 0;
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [n]);
  return (
    <div className="convo" ref={box} aria-live="polite">
      {session!.lines.map((l, i) => (
        <motion.div key={i} className={`bubble ${l.from}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          {l.from !== 'system' && <small>{l.from === 'agent' ? 'Toyota' : l.from === 'advisor' ? 'Toyota specialist' : 'You'}{l.via === 'text' ? ' (text)' : ''}</small>}
          {l.text}
        </motion.div>
      ))}
    </div>
  );
}
