/**
 * One command for demo day:  npm run go
 *  1. starts a Cloudflare tunnel to the backend (port 3001)
 *  2. writes the new tunnel link into server/key.env
 *  3. points the voice agent's tools at it (npm run setup:voice)
 *  4. starts the backend and the website
 * Quick tunnels get a new link every time, so the agent must be updated on every start.
 * Doing it here means the phone agent can always reach the tools.
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, 'server', 'key.env');
const isWin = process.platform === 'win32';
const children = [];

function run(cmd, args, opts = {}) {
  const p = spawn(cmd, args, { cwd: root, shell: isWin, windowsHide: true, stdio: opts.stdio ?? 'inherit', env: { ...process.env, ...(opts.env || {}) } });
  children.push(p);
  return p;
}

function stopAll() {
  for (const c of children) { try { c.kill(); } catch { /* already gone */ } }
  process.exit(0);
}
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

function setEnv(key, value) {
  let s = readFileSync(envPath, 'utf8');
  const line = `${key}=${value}`;
  s = new RegExp(`^${key}=.*$`, 'm').test(s) ? s.replace(new RegExp(`^${key}=.*$`, 'm'), line) : `${s.trimEnd()}\n${line}\n`;
  writeFileSync(envPath, s);
}

let tunnel = null;
function startTunnel() {
  return new Promise((resolve, reject) => {
    const t = run('cloudflared', ['tunnel', '--url', 'http://localhost:3001'], { stdio: ['ignore', 'pipe', 'pipe'] });
    tunnel = t;
    const timer = setTimeout(() => reject(new Error('cloudflared did not give a link within 40 seconds')), 40000);
    const onData = (buf) => {
      const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) { clearTimeout(timer); resolve(m[0]); }
    };
    t.stdout.on('data', onData);
    t.stderr.on('data', onData);
    t.on('error', () => reject(new Error('cloudflared is not installed. Run: winget install --id Cloudflare.cloudflared -e')));
  });
}

function waitFor(p) {
  return new Promise((resolve, reject) => p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exited with ${code}`)))));
}

/** New tunnel link, saved and handed to the voice agent. */
async function connect() {
  if (tunnel) { try { tunnel.kill(); } catch { /* already gone */ } }
  const url = await startTunnel();
  console.log(`    tunnel: ${url}`);
  setEnv('PUBLIC_BASE_URL', url);
  await waitFor(run(isWin ? 'npx.cmd' : 'npx', ['tsx', 'scripts/setup-voice-agent.ts'], { env: { PUBLIC_BASE_URL: url } }));
  return url;
}

/**
 * Watchdog: every 20 seconds, check the backend is reachable through the tunnel.
 * After a sleep, a Wi-Fi change or a dropped tunnel, it gets a new link and
 * re-points the voice agent automatically, so calls keep working.
 */
function watch(urlRef) {
  let fails = 0;
  let fixing = false;
  setInterval(async () => {
    if (fixing) return;
    try {
      const r = await fetch(`${urlRef.url}/api/nm/config`, { signal: AbortSignal.timeout(8000) });
      fails = r.ok ? 0 : fails + 1;
    } catch { fails++; }
    if (fails >= 2) {
      fixing = true;
      console.log('\n!! The tunnel stopped answering (sleep or Wi-Fi change). Reconnecting and updating the voice agent…');
      try { urlRef.url = await connect(); console.log('   Back online. Calls work again.\n'); fails = 0; }
      catch (e) { console.error(`   Reconnect failed: ${e.message}. Will retry.`); }
      fixing = false;
    }
  }, 20000);
}

(async () => {
  try {
    console.log('\n1/3 Starting the backend and website…');
    run(isWin ? 'npm.cmd' : 'npm', ['run', 'dev:all']);
    console.log('2/3 Opening the tunnel and pointing the voice agent at it…');
    const ref = { url: await connect() };
    console.log('3/3 Ready.  Open http://localhost:5173  (Ctrl + C stops everything)\n');
    watch(ref);
  } catch (e) {
    console.error(`\nCould not start: ${e.message}\n`);
    stopAll();
  }
})();
