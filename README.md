# The Fast and the Financed

**Your next move. We gotchu.**

Tap one button and Toyota Financial Services calls you. A voice assistant asks a few plain-English questions about your life, your driving and your budget, and your screen builds a personal car plan while you talk: exact monthly payments, side-by-side options, and a recap at the end. If money is tight, it hands you to a real person who already has the whole conversation.

Built solo at HackUTD 2026 for the Toyota Financial Services "What's Your Next Move?" challenge and the Photon track.

## Features

- **Get a call.** Enter your number, give consent, and your phone rings from a real Texas number.
- **Sign in by voice.** Current customers say their customer code. New customers get a new customer ID on the call.
- **Live screen.** The conversation, the answers and the plan appear on the page during the call.
- **Real numbers.** Every payment comes from a finance engine (amortization, lease math, sales tax), never from the language model.
- **Plan options.** Keep the car, pay it off sooner, refinance, trade up, lease, or certified pre-owned, each with a monthly price and trade-offs.
- **Learn.** Short lessons on APR, down payments, leases and total cost, each ending with a quick quiz. Words explained on the call are saved here.
- **Human handoff.** Hardship or "I want a person" goes to the Toyota staff view with full context.
- **Toyota staff view.** Impact numbers and a queue of customers who need a person.

## Tech stack

React, TypeScript, Vite, Framer Motion · Node.js, Express, Socket.IO · ElevenLabs Agents (voice, phone calls) with a Claude model · Photon (phone number, SIP calling, SMS) · Vitest

## Run it locally

Requires Node 22 or newer.

```bash
npm install
cp server/key.env.example server/key.env   # add your ElevenLabs and Photon keys
npm run go                                  # starts a tunnel, sets up the voice agent, runs the app
```

Open http://localhost:5173.

## Deploy

`render.yaml` deploys the site and API as one service on Render. Add the keys from `server/key.env.example` as environment variables. On start, the service points the voice agent at its own public URL.

## Project layout

| Path | What it is |
|---|---|
| `src/app/pages/` | Home, Talk to us, My account, My plan, Learn, Help, Toyota staff view |
| `server/nextmove/engine.ts` | Options and payment engine |
| `server/nextmove/tools.ts` | Tools the voice assistant calls during a call |
| `server/nextmove/elevenlabs.ts` | Outbound calls and live call transcript |
| `server/nextmove/photon.ts` | Texting through Photon |
| `scripts/setup-voice-agent.ts` | Creates or updates the voice agent and its tools |

All customer data in this project is made up for the demo. Payments are estimates, not offers.
