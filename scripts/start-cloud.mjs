/**
 * Cloud start (Render): point the voice agent at this server's public URL, then run the server.
 * If the agent setup fails (for example, out of ElevenLabs credits), the website still starts.
 */
import { spawnSync, spawn } from 'node:child_process';

const url = process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL;
if (url && process.env.ELEVENLABS_API_KEY) {
  console.log(`Pointing the voice agent at ${url}…`);
  const r = spawnSync('npx', ['tsx', 'scripts/setup-voice-agent.ts'], { stdio: 'inherit', env: { ...process.env, PUBLIC_BASE_URL: url } });
  if (r.status !== 0) console.warn('Voice agent setup failed. The site still runs; calls may not work until this is fixed.');
}
spawn('npx', ['tsx', 'server/index.ts'], { stdio: 'inherit' }).on('exit', (c) => process.exit(c ?? 0));
