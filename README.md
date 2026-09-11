# 🏷️ Bid for C

> A real-time, LAN-based auction quiz system built for college events. Teams bid with coins to win coding challenges, solve them under timed pressure for reward points — all broadcast live on projector screens.

![Bid for C Logo](client/public/assets/logo.png)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Application Routes](#application-routes)
- [Features](#features)
- [Architecture](#architecture)
- [Question System](#question-system)
- [Team Pool System](#team-pool-system)
- [Sound System](#sound-system)
- [Database](#database)
- [Scripts](#scripts)
- [License](#license)

---

## Overview

**Bid for C** is a gamified auction system designed for college C-programming events. It runs entirely on a local network (LAN) — no internet required. An admin controls the flow from a secret control panel while teams participate from their devices and audiences watch the action on projector display screens.

### How It Works

1. Teams register and are assigned a predefined team name from a pool
2. Admin starts an auction round with a coding question
3. Teams bid coins in real-time (+20 or +50 increments)
4. The highest bidder wins the question
5. The winning team attempts to solve the challenge under a timed countdown
6. Points are awarded or deducted based on success/failure
7. Scoreboard updates live across all connected screens

---

## Tech Stack

### Frontend (Client)

| Technology | Version | Purpose |
|---|---|---|
| **React** | 19.2 | UI library (latest with concurrent features) |
| **TypeScript** | 6.0 | Type-safe development |
| **Vite** | 8.2 | Build tool & dev server with HMR |
| **React Router DOM** | 7.18 | Client-side routing |
| **Socket.IO Client** | 4.8 | Real-time WebSocket communication |
| **Framer Motion** | 13.2 | Animations & transitions |
| **Oxlint** | 1.79 | Fast linter (Rust-based) |

### Backend (Server)

| Technology | Version | Purpose |
|---|---|---|
| **Node.js** | 22+ (v24 recommended) | JavaScript runtime |
| **Express** | 4.21 | HTTP server & REST API |
| **TypeScript** | 5.5 | Type-safe development |
| **Socket.IO** | 4.7 | Real-time bidirectional communication |
| **sql.js** | 1.11 | In-process SQLite database (WASM-based, no native binaries) |
| **xlsx** | 0.18 | Excel file parsing for team pool & questions |
| **uuid** | 10.0 | Unique identifier generation |
| **dotenv** | 17.4 | Environment variable management |
| **cors** | 2.8 | Cross-origin request handling |
| **tsx** | 4.19 | TypeScript execution for development |

### Dev Tooling

| Tool | Purpose |
|---|---|
| **concurrently** | Run server + client dev servers simultaneously |
| **@vitejs/plugin-react** | React Fast Refresh for Vite |

### Design System

- Custom token-based design system with CSS variables for runtime theme switching
- Centralized tokens for colors, typography, spacing, borders, and elevation
- Reusable style factories (`button()`, `card()`, `badge()`, `table()`)
- `BrandHeader` component shared across all screens

---

## Project Structure

```
auction-quiz/
├── client/                     # React frontend (Vite)
│   ├── public/
│   │   ├── assets/             # Logo, branding images
│   │   └── sounds/             # Sound effect MP3 files
│   └── src/
│       ├── assets/             # Static assets (hero image, icons)
│       ├── components/         # Shared UI components
│       │   ├── BrandHeader.tsx  # Consistent header across all screens
│       │   ├── Motion.tsx       # Animation wrapper components
│       │   ├── QuestionView.tsx # Question image display
│       │   ├── TaskStage.tsx    # Task phase stage indicator
│       │   └── TaskTimer.tsx    # Timer display component
│       ├── contexts/
│       │   └── ThemeContext.tsx  # Theme provider (light/dark)
│       ├── hooks/
│       │   ├── useGamePhase.ts  # Central game state hook (Socket.IO)
│       │   ├── useSocket.ts     # Socket connection hook
│       │   └── useSoundSystem.ts# Sound playback hook
│       ├── pages/
│       │   ├── AdminScreen.tsx      # Admin control panel
│       │   ├── TeamScreen.tsx       # Team registration & bidding
│       │   ├── LiveAuctionScreen.tsx # Live auction projector display
│       │   ├── ScoreboardScreen.tsx  # Scoreboard projector display
│       │   └── DisplayScreen.tsx     # Legacy display (deprecated)
│       ├── utils/
│       │   ├── motion.ts        # Animation presets & easing
│       │   └── soundManager.ts  # Sound effect manager
│       ├── shared/              # Shared types (client-side copy)
│       ├── design-system.ts     # Design tokens & style factories
│       ├── design-system.css    # CSS variable definitions
│       ├── theme.ts             # Theme color constants
│       ├── theme.css            # Theme CSS variables
│       ├── App.tsx              # Router & app shell
│       └── main.tsx             # Entry point
│
├── server/                     # Node.js backend
│   └── src/
│       ├── db/
│       │   ├── database.ts      # SQLite setup, migrations, persistence
│       │   └── reset.ts         # Database reset script
│       ├── handlers/
│       │   └── socket.handler.ts# All Socket.IO event handlers
│       ├── services/
│       │   ├── auction.service.ts     # Auction lifecycle & bidding logic
│       │   ├── team.service.ts        # Team CRUD & scoring
│       │   ├── team-pool.service.ts   # Predefined team name assignment
│       │   ├── task.service.ts        # Task lifecycle & results
│       │   ├── phase.service.ts       # Game state machine
│       │   ├── timer-engine.service.ts# Bidding, task & extra timers
│       │   ├── manual-timer.service.ts# Independent manual countdown
│       │   └── question.service.ts    # Question manifest loader
│       ├── types/               # TypeScript type definitions
│       ├── types.ts             # Shared server types
│       ├── auth.ts              # Admin authentication & IP validation
│       └── index.ts             # Server entry point
│
├── shared/                     # Shared types between client & server
│   └── types.ts
│
├── questions/                  # Question bank
│   ├── manifest.json           # Question metadata (id, image, reward, time)
│   ├── 1.jpg, 2.jpg, 3.jpg    # Question images
│   └── .gitkeep
│
├── templates/
│   └── question_template.html  # Question image template
│
├── docs/                       # Documentation & data files
│   ├── c_quiz_questions.xlsx   # Quiz question bank (Excel)
│   ├── quiz-questions.xlsx     # Alternative question set
│   └── easy/, medium/, hard/   # Difficulty-sorted questions
│
├── package.json                # Root package (concurrently)
└── README.md
```

---

## Prerequisites

- **Node.js** 22 or higher (v24 recommended)
- **npm** (comes with Node.js)
- All devices must be on the **same LAN/Wi-Fi network**

---

## Getting Started

### 1. Install Dependencies

```bash
cd auction-quiz
npm run install:all
```

This installs dependencies for the root workspace, server, and client.

### 2. Set Up Team Pool

Place your team pool Excel file at `server/data/team_pool.xlsx` with columns:
- `id` — numeric identifier
- `name` — team name (e.g., `#include`, `main()`, `printf()`)

### 3. Set Up Questions

Add question images (`.jpg`) to the `questions/` folder and update `questions/manifest.json`:

```json
[
  {
    "id": "q1",
    "image": "1.jpg",
    "reward": 100,
    "time": 180,
    "used": false
  }
]
```

### 4. Start the Application

```bash
npm run dev
```

This starts both the server (port 3000) and client dev server (port 5173) simultaneously.

### 5. Access the App

| Screen | URL | Purpose |
|---|---|---|
| Home | `http://localhost:5173` | Navigation hub |
| Team | `http://localhost:5173/team` | Team registration & bidding |
| Live Display | `http://localhost:5173/display/live` | Projector — live auction view |
| Scoreboard | `http://localhost:5173/display/scores` | Projector — leaderboard |
| Admin Panel | `http://localhost:5173/control-panel-7f8a9b2c` | Admin control (secret URL) |

> **LAN Access:** Find your machine's IP with `ipconfig` (Windows) or `ifconfig` (Mac/Linux), then other devices connect via `http://<your-ip>:5173`

---

## Configuration

### Environment Variables

Create a `.env` file in the `server/` directory (optional):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `ADMIN_SECRET` | `7f8a9b2c` | Secret string for admin route |
| `ALLOW_REMOTE_ADMIN` | `false` | Allow admin access from non-local IPs |

---

## Application Routes

| Route | Component | Description |
|---|---|---|
| `/` | `Home` | Landing page with navigation links |
| `/team` | `TeamScreen` | Team registration, bidding, and game view |
| `/display` | `DisplayChooser` | Choose between projector displays |
| `/display/live` | `LiveAuctionScreen` | Live auction broadcast for projector |
| `/display/scores` | `ScoreboardScreen` | Live scoreboard for projector |
| `/display/legacy` | `DisplayScreen` | Legacy display (deprecated) |
| `/control-panel-<secret>` | `AdminScreen` | Admin control panel |

---

## Features

### 🎯 Real-Time Bidding
- Server-authoritative auction engine with 800ms bid rate limiting
- Two bid increments: **+20** (standard) and **+50** (aggressive)
- Live bid updates across all connected clients via WebSocket

### 🧩 Task System
- Winning team receives a coding challenge with a configurable timer
- Admin-controlled task timer with manual start/pause/stop
- Optional fallback timer for extended time
- Pass/fail verdicts with point awards and deductions

### 🎮 Game State Machine
The server maintains a deterministic state machine with phases:

```
idle → bidding → post_bid_idle → main_task → fallback_idle → fallback_active → result_display → idle
```

All transitions are admin-controlled (except auction timer expiry).

### 📊 Live Scoreboard
- Top 5 teams displayed with rank badges
- Crown highlight for #1, tiered styling for top 3
- Real-time score updates via Socket.IO
- Optimized for projector/large screen display

### 🔊 Sound System
- 10 configurable sound events with per-sound enable/disable and volume control
- Events: `auction_start`, `auction_end`, `bid_small`, `bid_big`, `bid_win`, `timer_start`, `timer_end`, `pass`, `fail`, `tick`
- Upload custom MP3 files via admin panel

### 👥 Team Pool Assignment
- Predefined team names loaded from Excel file
- Automatic random assignment on registration
- Session locking — teams are bound to their device

### 🎨 Design System
- Token-based system with CSS custom properties
- Runtime theme switching support
- Consistent `BrandHeader` component across all screens
- Premium UI with Framer Motion animations

### 🔐 Admin Security
- Secret URL-based admin access
- IP-based access control (localhost-only by default)
- Configurable remote admin access

---

## Architecture

### Communication Model

```
┌─────────────┐     Socket.IO      ┌──────────────┐
│  Team Screen │◄──────────────────►│              │
├─────────────┤                    │   Express    │
│  Live Display│◄──────────────────►│   Server     │
├─────────────┤                    │              │
│  Scoreboard  │◄──────────────────►│  + Socket.IO │
├─────────────┤                    │              │
│  Admin Panel │◄──────────────────►│  + SQLite    │
└─────────────┘                    └──────────────┘
     Client (React)                   Server (Node)
```

### Key Design Decisions

- **Server-authoritative**: All game state lives on the server. Clients are views.
- **In-process SQLite**: Uses `sql.js` (WASM) — no external database server needed. Data persists to `server/data/auction.db` with auto-save every 5s.
- **Single socket handler**: All Socket.IO events are managed in one handler file for simplicity.
- **Service layer**: Business logic is separated into focused services (auction, team, task, timer, phase).
- **Shared types**: TypeScript types shared between client and server via `shared/types.ts`.

---

## Question System

Questions are stored as image files in the `questions/` directory with metadata in `manifest.json`:

```json
{
  "id": "q1",
  "image": "1.jpg",
  "reward": 100,
  "time": 180,
  "used": false
}
```

| Field | Description |
|---|---|
| `id` | Unique question identifier |
| `image` | Image filename in `questions/` |
| `reward` | Points awarded on successful completion |
| `time` | Time limit in seconds |
| `used` | Whether the question has been used |

Additional question data is available in `docs/` as Excel files organized by difficulty (easy, medium, hard).

---

## Team Pool System

Teams are assigned from a predefined pool stored in `server/data/team_pool.xlsx`:

| Column | Description |
|---|---|
| `id` | Numeric identifier |
| `name` | Team name (C-themed, e.g., `#include`, `printf()`, `malloc()`) |

On registration, teams provide player names, phone, and email. A random available team name is assigned from the pool. Each team name can only be assigned once per event.

---

## Sound System

Place MP3 files in `client/public/sounds/`:

| File | Event |
|---|---|
| `auction_start.mp3` | Auction round begins |
| `auction_end.mp3` | Auction round ends |
| `bid_small.mp3` | +20 bid placed |
| `bid_big.mp3` | +50 bid placed |
| `bid_win.mp3` | Team wins the auction |
| `timer_start.mp3` | Task timer begins |
| `timer_end.mp3` | Task timer expires |
| `pass.mp3` | Team passes the challenge |
| `fail.mp3` | Team fails the challenge |
| `tick.mp3` | Timer tick sound |

Sounds can be configured (enable/disable, volume) via the Admin Panel.

---

## Database

The application uses **sql.js** (SQLite compiled to WASM) for zero-dependency data persistence.

- **Location**: `server/data/auction.db`
- **Auto-save**: Every 5 seconds to disk
- **Tables**: `teams`, `auctions`, `tasks`, `team_pool`
- **Migrations**: Automatic column additions on startup for backward compatibility

### Reset Database

```bash
npm run db:reset --prefix server
```

This deletes the database file. Restart the server to create a fresh one.

---

## Scripts

### Root

| Script | Command | Description |
|---|---|---|
| `dev` | `npm run dev` | Start server + client concurrently |
| `install:all` | `npm run install:all` | Install all dependencies |

### Server (`server/`)

| Script | Command | Description |
|---|---|---|
| `dev` | `npm run dev --prefix server` | Start dev server with hot reload |
| `build` | `npm run build --prefix server` | Compile TypeScript to `dist/` |
| `start` | `npm run start --prefix server` | Run production build |
| `db:reset` | `npm run db:reset --prefix server` | Reset the database |

### Client (`client/`)

| Script | Command | Description |
|---|---|---|
| `dev` | `npm run dev --prefix client` | Start Vite dev server |
| `build` | `npm run build --prefix client` | TypeScript check + production build |
| `lint` | `npm run lint --prefix client` | Run Oxlint |
| `preview` | `npm run preview --prefix client` | Preview production build |

---

## Ports

| Service | Port | Notes |
|---|---|---|
| Server | `3000` | Express API + Socket.IO (binds to all interfaces) |
| Client | `5173` | Vite dev server |

---

## License

Built for college event use.
