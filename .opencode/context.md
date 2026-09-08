# Project Context — Auction Quiz LAN System

## Project Overview
- **Type**: LAN realtime auction system for college event
- **Stack**: Node/Express/Socket.IO server + React/Vite client
- **No Tailwind/CSS files** — all inline styles until design system was created
- **User's main projector screen** is `/display/live` (LiveAuctionScreen), NOT `/display` (DisplayScreen)
- **Admin secret**: `7f8a9b2c`
- **Allowed increments**: `[20, 50]` in `auction.service.ts`
- **Fonts**: Poppins (headings), Inter (body) via Google Fonts
- **Colors via CSS variables**: Primary #0B3C5D (default) / #0f172a (bidforc), Accent #D4AF37 (default) / #facc15 (bidforc)

## Design System
- `client/src/design-system.css` — CSS variables, keyframes, Google Fonts (Poppins + Inter)
- `client/src/design-system.ts` — tokens (color, font, space, radius, shadow, transition) + style factories
- `client/src/utils/motion.ts` — framer-motion presets (pageTransition, fadeUp, scalePop, scoreFlash, timerPulse, winnerReveal, hoverScale, staggerContainer)
- `client/src/components/Motion.tsx` — Reusable wrappers (PageTransition, FadeIn, ScalePop, ScoreFlash, TimerPulse, WinnerReveal, HoverCard, StaggerList, AnimatedNumber, ResultAnimation)
- `main.tsx` — imports `design-system.css` before `App.css`

### Color Tokens
- Primary #0B3C5D, Accent #D4AF37, Background #F8FAFC, Text #0F172A, Muted #64748B
- Success #22C55E, Warning #F59E0B, Danger #EF4444, Info #3A7CA5

## All Screens — Use Design System
- **LiveAuctionScreen** (`/display/live`) — Main projector. Uses design system tokens. Sub-components: TimerBadge, DifficultyBadge, BidDisplay, NextBidPill, FeedList.
- **ScoreboardScreen** (`/display/scores`) — Top 3 podium with gold/silver/bronze gradients, scale transforms (1.12/1.06/1.02), rank change animations, score flash. Expanded columns (140px points, 120px coins).
- **AdminScreen** — 12-col grid with Card component: Auction Control (8) + Manual Timer (4) / Question Bank (8) + Team Management (4) / Task Control (6) + Scoreboard (6).
- **TeamScreen** (`/team`) — Dashboard layout: large team name, center stat cards (Coins gold/Points green), dynamic status banner with pulse animation, bidding UI (+20/+50), keyboard shortcuts (←/→), toast notifications.
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

## Current Status — Mostly Complete

### Completed (Pushed)
- ✅ Design system: CSS variables, tokens, style factories, Google Fonts
- ✅ LiveAuctionScreen: State-based UI, framer-motion animations (timer pulse, bid scale pop, winner reveal with glow, PASS/FAIL animations)
- ✅ ScoreboardScreen: Top 3 podium (gold/silver/bronze), LayoutGroup for smooth reordering, AnimatePresence for list animations
- ✅ TeamScreen: Dashboard layout (large team name, center stat cards, status banner with pulse), bidding UI (+20/+50), keyboard shortcuts (←/→)
- ✅ AdminScreen: 12-col grid, Card component, collapsible sound panel
- ✅ Animation system: `utils/motion.ts` (presets), `components/Motion.tsx` (reusable wrappers), framer-motion integration
- ✅ Multi-increment bidding (+20 navy, +50 gold)
- ✅ Timer system: endAt single source of truth, +30s fix
- ✅ Sound system: 7 events, soundManager.ts, per-sound toggles, file upload
- ✅ Branding: BrandHeader component (4 variants), logo all screens
- ✅ Global theme: CSS variables, ThemeContext, admin toggle (default|bidforc)
- ✅ All routes wired in App.tsx, all screens compile clean

### In Progress
- ⏳ Admin Panel 2-column grid refactoring (analyzed but not yet applied)
  - Current: Auction Control (8) + Timer (4) / Image Bank (8) + Sound (4) / Theme (4) + Team (4) / Task (6) + Scoreboard (6)
  - Target: Auction Control + Timer (row), Image Bank (full width), Team + Theme (row), Task + Scoreboard (row)

### Pending
- Fix pre-existing TS errors in AdminScreen: `used` property missing on image type
- Fix pre-existing TS error in useGamePhase: `question:selected` event type
- Verify sounds play (browser autoplay policy issue)
- Event-day runbook (optional)

### Known Issues
- Timer +30s glitch reported by user but not yet reproduced
- Pre-existing TS errors (not blocking runtime)

## Git
- Repo: `https://github.com/RudraMistry-cmd/auction-quiz.git`
- All changes committed and pushed

## Key Files
```
client/src/
├── main.tsx                    # Entry, imports design-system.css
├── App.tsx                     # Router + all routes
├── design-system.css           # Global CSS variables, keyframes, fonts
├── design-system.ts            # Tokens + style factories
├── theme.css                   # CSS variables (default + bidforc themes)
├── contexts/ThemeContext.tsx    # Theme state management
├── shared/types.ts             # Client event types
├── pages/
│   ├── LiveAuctionScreen.tsx   # /display/live - framer-motion animations
│   ├── ScoreboardScreen.tsx    # /display/scores - LayoutGroup animations
│   ├── AdminScreen.tsx         # Admin panel (12-col grid + Card)
│   ├── TeamScreen.tsx          # Dashboard layout with status animations
│   └── DisplayScreen.tsx       # Legacy display (NOT used)
├── components/
│   ├── BrandHeader.tsx         # Reusable branding (4 variants)
│   ├── TaskTimer.tsx           # Task timer component
│   ├── Motion.tsx              # Reusable motion wrappers
│   └── QuestionView.tsx        # Question display
└── utils/
    ├── soundManager.ts         # Sound manager with per-sound toggles
    └── motion.ts               # Animation presets and timing constants

server/src/
├── index.ts                    # Express server + routes
├── types.ts                    # Server event types (admin:theme, theme:changed)
├── handlers/socket.handler.ts  # Socket handlers + currentTheme state
├── services/
│   ├── manual-timer.service.ts # Timer with endAt
│   ├── team.service.ts         # Team + scoreboard
│   ├── auction.service.ts      # ALLOWED_INCREMENTS=[20,50]
│   └── task.service.ts         # Task logic
└── auth.ts                     # Admin secret, ALLOW_REMOTE_ADMIN
```
