# Auction Quiz System

Realtime LAN-based auction quiz for college events. Teams bid with coins,
winners solve tasks for reward points, all live on projector screens.

## Requirements

- Node.js 22+ (v24 recommended)

## Quick Start

```bash
cd auction-quiz
npm run install:all   # install root + server + client dependencies
npm run dev           # starts both services
```

Then open:
- Team / Admin / Displays → http://localhost:5173
- Find your LAN IP (e.g. `ipconfig`) so other devices can join via `http://<your-ip>:5173`

## Ports

| Service | Port | Notes                      |
| ------- | ---- | -------------------------- |
| Server  | 3000 | API + Socket.IO, binds LAN |
| Client  | 5173 | Vite dev server            |

## Features

- **Realtime bidding** — server-authoritative 60s auctions, 800ms rate limit, instant bid/timer broadcasts.
- **Task system** — winners get 5-minute tasks (pause/resume/+30s controls), pass/fail verdicts, 30s undo window.
- **Question engine** — import `.xlsx` banks (easy/medium/hard pools), admin picks per round, questions shown on every screen.
- **Displays** — live auction projector view, scoreboard, team and admin screens.

## Notes

- **No env setup required.** Defaults work out of the box:
  - `PORT=3000`, `ADMIN_KEY=auction-admin`
  - To override, copy `server/.env.example` to `server/.env` and edit it.
- **DB auto-creates.** SQLite (WASM, no native build tools needed) initializes `server/data/` on first run with all tables and migrations.
- **Resetting.** Stop the server, run `npm run db:reset --prefix server`, restart — teams, auctions, tasks, and questions are wiped for a fresh event.
