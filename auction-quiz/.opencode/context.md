# Project Context: Bid for C Auction System

## Environment
- **Language**: TypeScript (server + client)
- **Runtime**: Node.js + Vite
- **Server**: Express + Socket.IO
- **Client**: React + Vite
- **Package Manager**: npm
- **Admin Secret**: `7f8a9b2c`

## Project Structure
- `server/` - Express + Socket.IO backend
- `client/` - React + Vite frontend
- `client/public/assets/logo.png` - Bid for C logo
- `client/public/sounds/` - Sound effect MP3 files

## Completed Work

### Core Features
- ✅ Multi-increment bidding (ALLOWED_INCREMENTS=[20,50])
- ✅ Question image persistence (getPublicState() returns currentQuestionImage)
- ✅ Timer visibility (top center, clamp sizing, color transitions)
- ✅ +30s timer fix (endAt as single source of truth)
- ✅ Used questions (selectable with gold "USED" badge)
- ✅ Sound trigger events (all 7 sound:* events)
- ✅ Sound manager utility (client/src/utils/soundManager.ts)
- ✅ LiveAuctionScreen sound integration
- ✅ Admin:sound_settings handler
- ✅ Admin:sound_per_setting handler (per-sound enable/disable)
- ✅ Server endpoints (GET /api/sounds, POST /api/sounds/upload)
- ✅ Collapsible Sound Settings panel in AdminScreen

### Branding (Just Completed)
- ✅ Logo stored at `client/public/assets/logo.png`
- ✅ Created `client/src/components/BrandHeader.tsx` (4 variants)
- ✅ LiveAuctionScreen: top center (large logo + glow + tagline)
- ✅ ScoreboardScreen: top center (logo + "LEADERBOARD")
- ✅ AdminScreen: top left (compact logo)
- ✅ TeamScreen: top left (minimal logo)
- ✅ Entrance animation (fade-in + scale)
- ✅ Glow effect on live screen logo

## Pending Tasks
- Timer +30s glitch (needs exact reproduction steps from user)
- Sound files not playing (likely browser autoplay policy)
- Pre-existing TypeScript errors (design tokens, unused imports)

## Key Files
- `server/src/services/auction.service.ts` - Bidding logic
- `server/src/services/manual-timer.service.ts` - Timer with endAt
- `server/src/handlers/socket.handler.ts` - Socket handlers
- `server/src/index.ts` - Express routes
- `client/src/pages/LiveAuctionScreen.tsx` - Projector screen
- `client/src/pages/AdminScreen.tsx` - Admin panel
- `client/src/pages/TeamScreen.tsx` - Team bidding
- `client/src/pages/ScoreboardScreen.tsx` - Leaderboard
- `client/src/utils/soundManager.ts` - Sound manager
- `client/src/components/BrandHeader.tsx` - Reusable branding component

## Design System
- Colors: Primary #0B3C5D (navy), Accent #D4AF37 (gold)
- Fonts: Poppins (headings), Inter (body)
- Background: #F8FAFC, Text: #0F172A, Muted: #64748B
