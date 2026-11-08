import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Icon } from '../../components/nm/icons';
import { useApp } from '../state';

export function Help() {
  const { session, config, askForPerson, phone: savedPhone } = useApp();
  const [note, setNote] = useState('');
  const [phone, setPhone] = useState(session?.phone || savedPhone || '');
  const [sent, setSent] = useState(false);
  const handoff = session?.handoff;
  const thread = (session?.lines ?? []).filter((l) => l.via === 'text' || l.from === 'advisor');
  const number = config?.photonNumber;

  const send = async () => {
    await askForPerson(note.trim() || undefined, phone);
    setSent(true);
    setNote('');
  };

  return (
    <div className="page stack" style={{ gap: 28 }}>
      <div>
        <h1 className="display d2">Talk to a real person</h1>
        <p className="lead" style={{ marginTop: 12 }}>A Toyota specialist can see your whole conversation, so you never have to start over.</p>
      </div>

      {handoff?.open ? (
        <motion.div className="insight" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <span className="dot tone-good"><Icon name="headset" /></span>
          <div><b>A specialist has your case.</b><p className="muted" style={{ marginTop: 4 }}>They'll text you{number ? ` from ${number}` : ''}. Replies show up below too.</p></div>
        </motion.div>
      ) : handoff ? (
        <div className="insight"><span className="dot tone-good"><Icon name="check" /></span><b>Your specialist marked this as taken care of. Ask again anytime.</b></div>
      ) : null}

      <div className="grid-2">
        <section className="panel stack" aria-labelledby="ask">
          <h2 id="ask" className="h4">{handoff?.open ? 'Add a note for your specialist' : 'Ask for a person'}</h2>
          <p className="muted">Good reasons to ask: money is tight, something doesn't look right, or you'd just rather talk to someone.</p>
          <div className="field">
            <label htmlFor="note">What should they know? (optional)</label>
            <textarea id="note" className="input" rows={4} placeholder="My hours got cut and I might be late next month." value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="help-phone">Text me at</label>
            <input id="help-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="(469) 555-0123" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <button className="btn btn-red" onClick={send} disabled={!session}><Icon name="headset" /> {handoff?.open ? 'Send to my specialist' : 'Get a specialist'}</button>
          {sent && <p className="small" role="status">Sent. We just texted you to confirm, and a specialist will follow up there.</p>}
        </section>

        <section className="panel stack" aria-labelledby="text">
          <h2 id="text" className="h4">Prefer texting?</h2>
          {number ? (
            <p className="muted">Text <b>{number}</b> anytime. Our AI answers right away, and a person steps in when needed.</p>
          ) : (
            <p className="muted">Once texting is on, you'll be able to text Toyota anytime. Our AI answers right away, and a person steps in when needed.</p>
          )}
          <div className="well stack" style={{ gap: 10 }}>
            <div className="row"><b style={{ minWidth: 92 }}>CALL</b><span className="muted">We call you back</span></div>
            <div className="row"><b style={{ minWidth: 92 }}>ADVISOR</b><span className="muted">A real person texts you</span></div>
            <div className="row"><b style={{ minWidth: 92 }}>STOP</b><span className="muted">No more texts from us</span></div>
          </div>
        </section>
      </div>

      {thread.length > 0 && (
        <section className="panel" aria-labelledby="thread">
          <h2 id="thread" className="h4" style={{ marginBottom: 16 }}>Your messages</h2>
          <div className="convo">
            {thread.map((l, i) => (
              <div key={i} className={`bubble ${l.from}`}>
                <small>{l.from === 'agent' ? 'Toyota AI' : l.from === 'advisor' ? 'Toyota specialist' : 'You'}</small>
                {l.text}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
