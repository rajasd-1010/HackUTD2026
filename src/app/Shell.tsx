import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from '../components/nm/icons';
import { useApp } from './state';

export type Route = 'home' | 'car' | 'call' | 'plan' | 'learn' | 'help' | 'staff';
const ROUTES: Route[] = ['home', 'car', 'call', 'plan', 'learn', 'help', 'staff'];

export const NAV: Array<{ id: Route; label: string; icon: string }> = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'call', label: 'Talk to us', icon: 'phone' },
  { id: 'car', label: 'My account', icon: 'user' },
  { id: 'plan', label: 'My plan', icon: 'plan' },
  { id: 'learn', label: 'Learn', icon: 'book' },
  { id: 'help', label: 'Help', icon: 'help' },
];

/** Customers only see "My account" once the call has found out who they are. */
function useNav() {
  const { who } = useApp();
  return NAV.filter((n) => n.id !== 'car' || who.kind !== 'unknown');
}

function parse(): Route {
  const h = window.location.hash.replace(/^#\/?/, '').split('?')[0] as Route;
  return ROUTES.includes(h) ? h : 'home';
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const on = () => { setRoute(parse()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [route, (r) => { window.location.hash = `/${r === 'home' ? '' : r}`; }];
}

export const go = (r: Route) => { window.location.hash = `/${r === 'home' ? '' : r}`; };

export function Brand() {
  return (
    <a href="#/" className="wordmark" aria-label="The Fast and the Financed, home">
      <span className="wm-top">THE FAST AND THE</span>
      <span className="wm-bottom">FINANCED</span>
    </a>
  );
}


export function Shell({ route, children }: { route: Route; children: React.ReactNode }) {
  const onHero = route === 'home';
  const nav = useNav();
  const staff = route === 'staff';
  return (
    <>
      <a href="#main" className="sr">Skip to content</a>
      <header className={`topbar ${onHero ? 'on-hero' : ''}`} style={onHero ? ({ ['--mark' as any]: 'var(--red)' }) : undefined}>
        <div className="topbar-inner">
          <Brand />
          {staff ? (
            <div className="row" style={{ gap: 12 }}>
              <span className="badge badge-warn">Toyota staff</span>
              <a className="btn btn-ghost btn-sm" href="#/">Customer site</a>
            </div>
          ) : (
          <nav className="nav" aria-label="Sections">
            {nav.map((n) => (
              <a key={n.id} href={`#/${n.id === 'home' ? '' : n.id}`} className={route === n.id ? 'active' : ''} aria-current={route === n.id ? 'page' : undefined}>
                {route === n.id && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                {n.label}
              </a>
            ))}
          </nav>
          )}
        </div>
      </header>

      <main id="main">
        <AnimatePresence mode="wait">
          <motion.div key={route} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      <CallDock route={route} />

      <footer className="footer">
        <div className="footer-inner">
          <span>The Fast and the Financed, for Toyota Financial Services. Your next move. We gotchu · HackUTD 2026 demo with made-up accounts. Estimates, not offers.</span>
          <a href="#/staff">Toyota staff login</a>
        </div>
      </footer>

      {!staff && <nav className="tabs" aria-label="Sections">
        {nav.map((n) => (
          <a key={n.id} href={`#/${n.id === 'home' ? '' : n.id}`} className={route === n.id ? 'active' : ''} aria-current={route === n.id ? 'page' : undefined}>
            <Icon name={n.icon} />{n.label}
          </a>
        ))}
      </nav>}
    </>
  );
}

/** Follows the user around while a call is happening, so they can browse without losing it. */
function CallDock({ route }: { route: Route }) {
  const { live, session, browserLive, agentSpeaking } = useApp();
  const show = (live || browserLive) && route !== 'call';
  const label = session?.status === 'dialing' ? 'Calling your phone…' : session?.status === 'analyzing' ? 'Working out your options…' : browserLive && agentSpeaking ? 'Toyota is talking…' : 'On a call with Toyota';
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="dock" initial={{ y: 40, opacity: 0, x: '-50%' }} animate={{ y: 0, opacity: 1, x: '-50%' }} exit={{ y: 40, opacity: 0, x: '-50%' }} role="status">
          <span className="pulse" />
          <span style={{ fontWeight: 600 }}>{label}</span>
          <a className="btn btn-red btn-sm" href="#/call">Open call</a>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Where the customer is in the journey: talk, see the plan, take the next step. */
export function Journey({ at }: { at: 'call' | 'plan' | 'help' }) {
  const { session } = useApp();
  const talked = !!session?.result || session?.status === 'ended';
  const chose = !!session?.chosenOptionId || !!session?.handoff || !!session?.result;
  const steps = [
    { id: 'call', label: 'Talk to us', done: talked, href: '#/call' },
    { id: 'plan', label: 'See your plan', done: chose, href: '#/plan' },
  ];
  return (
    <ol className="journey" aria-label="Your progress">
      {steps.map((s, i) => (
        <li key={s.id} className={`${s.id === at ? 'now' : ''} ${s.done ? 'done' : ''}`}>
          <a href={s.href} aria-current={s.id === at ? 'step' : undefined}>
            <span className="journey-n">{s.done ? <Icon name="check" /> : i + 1}</span>
            {s.label}
          </a>
        </li>
      ))}
    </ol>
  );
}
