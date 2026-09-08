# Project Context: Bid for C Auction System

## Environment
- **Language**: TypeScript (server + client)
- **Runtime**: Node.js + Vite
- **Server**: Express + Socket.IO
- **Client**: React + Vite
- **Admin Secret**: `7f8a9b2c`
- **Git**: Pushed to `https://github.com/RudraMistry-cmd/auction-quiz.git`

## Project Structure
- `server/` - Express + Socket.IO backend
- `client/` - React + Vite frontend
- `client/public/assets/logo.png` - Bid for C logo
- `client/public/sounds/` - 6 MP3 sound files

## Completed Features

### Core System
- ✅ Multi-increment bidding (+20 navy, +50 gold)
- ✅ Question image persistence
- ✅ Timer visibility (top center, clamp sizing, color transitions)
- ✅ +30s timer fix (endAt as single source of truth)
- ✅ Used questions (selectable with gold badge)

### Sound System
- ✅ 7 sound trigger events from socket.handler.ts
- ✅ Sound manager utility (client/src/utils/soundManager.ts)
- ✅ LiveAuctionScreen sound integration
- ✅ Admin:sound_settings handler (global enable/volume)
- ✅ Admin:sound_per_setting handler (per-sound enable/disable)
- ✅ Server endpoints (GET /api/sounds, POST /api/sounds/upload)
- ✅ Collapsible Sound Settings panel in AdminScreen

### Branding
- ✅ BrandHeader component (4 variants: live, scoreboard, admin, team)
- ✅ All screens branded with logo + "Bid for C"
- ✅ Entrance animation (fade-in + scale)
- ✅ Tagline: "Bid Smart. Code Fast. Win Big."

### Registration Redesign
- ✅ Split layout with branding + form
- ✅ Navy background, gold accents
- ✅ Footer: About, How it Works, Winning Criteria

### Global Theme System
- ✅ CSS variables layer (client/src/theme.css)
- ✅ ThemeContext for state management
- ✅ Server stores currentTheme in memory
- ✅ New clients get theme immediately on connect
- ✅ Admin toggle: Default | Bid for C
- ✅ Smooth 0.3s transitions between themes
- ✅ design-system.ts tokens use CSS variables

### LiveAuctionScreen Redesign (Just Completed)
- ✅ State-based UI (idle, auction, ended, task, result)
- ✅ Navy background, gold highlights
- ✅ Timer at top center (large)
- ✅ Massive bid display (`clamp(6rem, 18vw, 14rem)`)
- ✅ Smooth animations (fadeScale, bidPop, pulse)
- ✅ Winner display with glow effect
- ✅ Task/Result states

## Pending Tasks
- Timer +30s glitch (needs exact reproduction steps)
- Sound files not playing (likely browser autoplay policy)
- Pre-existing TypeScript errors (design tokens, unused imports)

## Key Files
- `server/src/handlers/socket.handler.ts` - Socket handlers + theme state
- `server/src/services/auction.service.ts` - Bidding logic (ALLOWED_INCREMENTS=[20,50])
- `server/src/services/manual-timer.service.ts` - Timer with endAt
- `client/src/pages/LiveAuctionScreen.tsx` - Projector screen (state-based UI)
- `client/src/pages/AdminScreen.tsx` - Admin panel + theme toggle
- `client/src/pages/TeamScreen.tsx` - Team bidding + registration
- `client/src/pages/ScoreboardScreen.tsx` - Leaderboard
- `client/src/theme.css` - CSS variables (default + bidforc)
- `client/src/design-system.ts` - Design tokens (CSS variables)
- `client/src/contexts/ThemeContext.tsx` - Theme state

## Socket Events
- `admin:sound_settings` → `sound:settings`
- `admin:sound_per_setting` → `sound:per_setting`
- `admin:theme` → `theme:changed`

## Theme System
- Server stores `currentTheme` (default: "default")
- On connect: server sends `theme:changed` immediately
- Themes: default (navy/gold), bidforc (darker navy/brighter gold)
- CSS variables switch with 0.3s ease transition

## Git Status
- Branch: master
- Pushed to: https://github.com/RudraMistry-cmd/auction-quiz.git
