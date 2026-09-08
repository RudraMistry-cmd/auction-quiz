# Project Context — Auction Quiz LAN System

## Project Overview
- **Type**: LAN realtime auction system for college event
- **Stack**: Node/Express/Socket.IO server + React/Vite client
- **No Tailwind/CSS files** — all inline styles until design system was created
- **User's main projector screen** is `/display/live` (LiveAuctionScreen), NOT `/display` (DisplayScreen)

## Design System
- `client/src/design-system.css` — CSS variables, keyframes (bidPop, goldFlash, slideUp, fadeScale, pulse, scoreFlash, fadeSlideUp, toastSlide), Google Fonts (Poppins + Inter)
- `client/src/design-system.ts` — tokens (color, font, space, radius, shadow, transition) + style factories: `button()`, `card()`, `badge()`, `table`, `input()`, `overlay`, `page`, `divider`, `avatar()`, `tabular`, `labelStyle`
- `client/src/theme.ts` — backward-compatible re-export wrapper
- `main.tsx` — imports `design-system.css` before `App.css`

### Color Tokens
- Primary #0B3C5D, Accent #D4AF37, Background #F8FAFC, Text #0F172A, Muted #64748B
- Success #22C55E, Warning #F59E0B, Danger #EF4444, Info #3A7CA5

## All Screens — Use Design System
- **LiveAuctionScreen** (`/display/live`) — Main projector. Uses design system tokens. Sub-components: TimerBadge, DifficultyBadge, BidDisplay, NextBidPill, FeedList.
- **ScoreboardScreen** (`/display/scores`) — 12-col grid. RankBadge (gold/silver/bronze), TeamRow with podium styling, rank change indicators (▲/▼), score flash animation.
- **AdminScreen** — 12-col grid with Card component: Auction Control (8) + Manual Timer (4) / Question Bank (8) + Team Management (4) / Task Control (6) + Scoreboard (6).
- **TeamScreen** (`/team`) — Registration form, bidding UI (ENTER + 1.5s cooldown), toast notifications, coin/point flash. No question shown to teams.
- **DisplayScreen** (`/display/legacy`) — Secondary display (legacy, NOT used)

## Routing (App.tsx)
- `/` — Home
- `/team` — TeamScreen
- `/control-panel-{ADMIN_SECRET}` — AdminScreen
- `/display` — DisplayChooser
- `/display/live` — LiveAuctionScreen (MAIN PROJECTOR)
- `/display/scores` — ScoreboardScreen
- `/display/legacy` — DisplayScreen

## Server
- Manual timer: `server/src/services/manual-timer.service.ts`, `/api/timer` REST endpoint
- All socket handlers in `server/src/handlers/socket.handler.ts`
- Scoreboard: `client:get_scoreboard` returns teams sorted by reward_points

## Current Status — ALL COMPLETE
- ✅ Design system created and imported in main.tsx
- ✅ LiveAuctionScreen refactored with design system tokens
- ✅ ScoreboardScreen fully rebuilt with premium design
- ✅ TeamScreen fully rewritten with premium design
- ✅ AdminScreen refactored with 12-column grid + Card component
- ✅ All routes wired in App.tsx
- ✅ All screens compile clean
- ✅ All old color references fixed (ink→text, green→success, red→danger, violet→info, gold→accent, surfaceBorder→border)

## Pending Tasks (Optional / Future)
- Migrate DisplayScreen to design system
- Event-day runbook
- Any new features user requests

## Key Files
```
client/src/
├── main.tsx                    # Entry, imports design-system.css
├── App.tsx                     # Router + all routes
├── design-system.css           # Global CSS variables, keyframes, fonts
├── design-system.ts            # Tokens + style factories
├── theme.ts                    # Backward-compatible re-export
├── shared/types.ts             # All TypeScript interfaces
├── pages/
│   ├── LiveAuctionScreen.tsx   # /display/live (MAIN PROJECTOR)
│   ├── ScoreboardScreen.tsx    # /display/scores
│   ├── AdminScreen.tsx         # Admin panel (12-col grid + Card)
│   ├── TeamScreen.tsx          # Team view
│   └── DisplayScreen.tsx       # Legacy display
├── components/
│   ├── TaskStage.tsx           # Task timer
│   ├── TaskTimer.tsx           # Task timer component
│   └── QuestionView.tsx        # Question display
└── hooks/
    ├── useSocket.ts            # Socket connection
    └── useGamePhase.ts         # Phase/timer state

server/src/
├── index.ts                    # Express server + routes
├── handlers/socket.handler.ts  # All socket events
├── services/
│   ├── manual-timer.service.ts # Manual timer with tick broadcast
│   ├── team.service.ts         # Team + scoreboard
│   ├── auction.service.ts      # Auction logic
│   └── task.service.ts         # Task logic
└── auth.ts                     # Admin secret, ALLOW_REMOTE_ADMIN
```
