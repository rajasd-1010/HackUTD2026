import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from '../../components/nm/icons';
import { topics, topicForTerm, type Topic } from '../../components/nm/learnContent';
import { useApp } from '../state';

export function Learn() {
  const { learned } = useApp();
  const [activeId, setActiveId] = useState(() => sessionStorage.getItem('nm_topic') || topics[0].id);
  const [quiz, setQuiz] = useState(false);
  const [showExample, setShowExample] = useState(true);
  const [scores, setScores] = useState<Record<string, number>>(() => { try { return JSON.parse(localStorage.getItem('nm_quiz') || '{}'); } catch { return {}; } });
  useEffect(() => { sessionStorage.removeItem('nm_topic'); }, []);
  const t = topics.find((x) => x.id === activeId) ?? topics[0];

  const saveScore = (n: number) => {
    const next = { ...scores, [t.id]: Math.max(n, scores[t.id] ?? 0) };
    setScores(next);
    try { localStorage.setItem('nm_quiz', JSON.stringify(next)); } catch { /* storage unavailable */ }
  };

  return (
    <div className="page stack" style={{ gap: 32 }}>
      <div>
        <h1 className="display d2">Learn the money side of cars</h1>
        <p className="lead" style={{ marginTop: 12 }}>Short, plain lessons with real examples. Take a 3-question quiz when you're ready.</p>
      </div>

      {learned.length > 0 && (
        <section className="panel" aria-labelledby="fromcall">
          <div className="between" style={{ marginBottom: 16 }}>
            <h2 id="fromcall" className="h4">From your calls</h2>
            <span className="badge badge-go">{learned.length} word{learned.length > 1 ? 's' : ''} learned</span>
          </div>
          <div className="terms">
            {learned.map((l) => {
              const topic = topicForTerm(l.key);
              return (
                <div key={l.key} className="well">
                  <b>{l.term}</b>
                  <p style={{ marginTop: 4, fontSize: 15 }}>{l.short}</p>
                  {topic && <button className="link" style={{ marginTop: 8 }} onClick={() => setActiveId(topic.id)}>Open the {topic.title.toLowerCase().replace('?', '')} lesson</button>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="learn">
        <nav className="topic-list" aria-label="Lessons">
          {topics.map((x) => (
            <button key={x.id} className={`topic-btn ${x.id === t.id ? 'active' : ''}`} onClick={() => setActiveId(x.id)} aria-current={x.id === t.id}>
              <span className="topic-ico"><Icon name={x.icon} /></span>
              <span style={{ flex: 1 }}>{x.title}</span>
              {scores[x.id] !== undefined && <span className="badge badge-go" style={{ padding: '3px 9px', fontSize: 12 }}>{scores[x.id]}/3</span>}
            </button>
          ))}
        </nav>

        <AnimatePresence mode="wait">
          <motion.article key={t.id} className="panel stack" style={{ gap: 28 }} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.22 }}>
            <div className="between">
              <h2 className="display d3">{t.title}</h2>
              <button className="btn btn-red" onClick={() => setQuiz(true)}><Icon name="play" /> Take the quiz</button>
            </div>
            <p style={{ fontSize: 20, lineHeight: 1.5, maxWidth: '34em' }}>{t.definition}</p>
            <div>
              <h3 className="h4">How it works</h3>
              <p className="muted" style={{ marginTop: 8, maxWidth: '38em' }}>{t.how}</p>
            </div>
            <div>
              <div className="between" style={{ marginBottom: 12 }}>
                <h3 className="h4">Real example</h3>
                <button className="link" onClick={() => setShowExample((v) => !v)} aria-expanded={showExample}>{showExample ? 'Hide example' : 'Show example'}</button>
              </div>
              <AnimatePresence initial={false}>
                {showExample && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                    <div className="example">
                      <b style={{ fontSize: 18 }}>{t.example.title}</b>
                      <div className="example-lines">{t.example.lines.map((l) => <span key={l}>{l}</span>)}</div>
                      <div className="impact">{t.example.impact.replace(/^Impact:\s*/, '')}</div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div>
              <h3 className="h4" style={{ marginBottom: 12 }}>Tips</h3>
              <ul className="tips">{t.tips.map((tip) => <li key={tip}><Icon name="check" />{tip}</li>)}</ul>
            </div>
          </motion.article>
        </AnimatePresence>
      </div>

      <section aria-labelledby="rule">
        <h2 id="rule" className="display d3" style={{ marginBottom: 6 }}>A simple rule of thumb: 20/4/10</h2>
        <p className="muted" style={{ marginBottom: 18 }}>Not a law, just a good starting point when you buy.</p>
        <div className="rule">
          <div><span className="num">20%</span><b>down</b><p className="muted" style={{ marginTop: 6 }}>Pay at least a fifth upfront so you borrow less.</p></div>
          <div><span className="num">4 years</span><b>or less to pay it off</b><p className="muted" style={{ marginTop: 6 }}>Shorter loans mean less interest.</p></div>
          <div><span className="num">10%</span><b>of your monthly income</b><p className="muted" style={{ marginTop: 6 }}>Payment, insurance and gas together, at most.</p></div>
        </div>
      </section>

      <AnimatePresence>{quiz && <Quiz topic={t} onClose={() => setQuiz(false)} onDone={saveScore} />}</AnimatePresence>
    </div>
  );
}

function Quiz({ topic, onClose, onDone }: { topic: Topic; onClose: () => void; onDone: (n: number) => void }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const q = topic.quiz[i];
  const finished = i >= topic.quiz.length;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const pick = (n: number) => { if (picked === null) { setPicked(n); if (n === q.answer) setScore((s) => s + 1); } };
  const next = () => { if (i + 1 >= topic.quiz.length) onDone(score); setI(i + 1); setPicked(null); };

  return (
    <motion.div className="quiz-bg" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label={`${topic.title} quiz`}>
      <motion.div className="panel quiz stack" onClick={(e) => e.stopPropagation()} initial={{ y: 30, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, opacity: 0 }}>
        <div className="between">
          <span className="small">{topic.title}{!finished && ` · question ${i + 1} of ${topic.quiz.length}`}</span>
          <button className="link" onClick={onClose}>Close</button>
        </div>
        {finished ? (
          <div className="stack" style={{ textAlign: 'center', padding: '12px 0' }}>
            <span className="num" style={{ fontSize: 72, color: score === topic.quiz.length ? 'var(--go)' : 'var(--ink)' }}>{score}/{topic.quiz.length}</span>
            <p className="lead" style={{ margin: '0 auto' }}>{score === topic.quiz.length ? "Perfect. You're ready to talk numbers with anyone." : 'Nice try. Read the example again and give it another go.'}</p>
            <button className="btn btn-red" style={{ alignSelf: 'center' }} onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <h2 className="h4" style={{ fontSize: 22 }}>{q.q}</h2>
            {q.choices.map((c, n) => (
              <button key={c} className={`answer ${picked !== null && n === q.answer ? 'right' : ''} ${picked === n && n !== q.answer ? 'wrong' : ''}`} onClick={() => pick(n)}>{c}</button>
            ))}
            {picked !== null && (
              <motion.div className="stack" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <p className="muted"><b style={{ color: picked === q.answer ? 'var(--go)' : 'var(--red)' }}>{picked === q.answer ? 'Correct.' : 'Not quite.'}</b> {q.why}</p>
                <button className="btn btn-red" onClick={next}>{i + 1 >= topic.quiz.length ? 'See my score' : 'Next question'}</button>
              </motion.div>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
