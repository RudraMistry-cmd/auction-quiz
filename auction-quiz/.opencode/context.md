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
- `client/public/sounds/` - 6 MP3 sound files (wav also supported now)

## Current Status
- Scoreboard overhaul DONE (`client/src/pages/ScoreboardScreen.tsx`, tsc clean): 80px header matching Team/Live (center compact BrandHeader, empty spacers, no timer/controls); full-width centered top-5 layout; LEADERBOARD + "Top Performing Teams" title block; stable sort POINTS→COINS→name; system-color rank badges (#1 accent + crown, #2 primary, #3 outlined, #4/5 minimal); surface cards with elevation/glow emphasis (no gradient fills); socket+polling live updates with fixed off() cleanup; subtle layout/fade/number animations; "Waiting for results..." empty state; memoized + flicker guard.
- Sound system standardized DONE (client + server tsc clean, no scattered play calls):
  - `client/src/utils/soundManager.ts` rewritten: canonical types (auction_start, bid_placed, bid_win, timer_tick, timer_end, task_pass, task_fail, fallback_start, result_show) + legacy aliases; extensionless bases probed as .mp3 then .wav with cross-sound fallback chain; throttles (bid 200ms, tick 900ms); playUnique(eventKey) dedupe; volume normalization; localStorage persist (auc_sound_enabled/volume); global first-gesture unlock via installGlobalSoundUnlock().
  - New `client/src/hooks/useSoundSystem.ts`: central socket event→sound map (auction/bid/win/timer:end/task:result/result:declared/phase fallback/extra-timer/tick≤5s + server sound:* mirrors) with cross-source once-guards (timer-end 3.5s, task-result 2.5s, fallback 6s, auction-start 2.5s).
  - Wired: `useSoundSystem(socket)` in Admin, Team, Live, Scoreboard, Display; `installGlobalSoundUnlock()` once in App; LiveAuctionScreen scattered plays + local unlock removed; Admin toggles apply locally instantly + broadcast, init from persisted settings.
- .wav + .mp3 support DONE: server `/api/sounds` resolves newest of name.mp3/name.wav (returns ext+path); upload takes ?ext= + Content-Type sniff, deletes sibling ext; manager probes both extensions; Admin upload accepts/picks wav|mp3 and shows real ext.

## Pending Tasks
- None active. (Historical notes: timer +30s glitch needs repro steps; autoplay-policy sound failures resolved via unlock gate; TS errors resolved — both projects tsc-clean.)

## Key Files
- `server/src/handlers/socket.handler.ts` - Socket handlers + theme state + sound:* emits
- `server/src/index.ts` - /api/sounds (mp3+wav resolve), /api/sounds/upload (ext-aware)
- `server/src/services/auction.service.ts` - Bidding logic (ALLOWED_INCREMENTS=[20,50])
- `server/src/services/manual-timer.service.ts` - Timer with endAt
- `client/src/pages/LiveAuctionScreen.tsx` - Projector screen, sounds via hook only
- `client/src/pages/AdminScreen.tsx` - Admin panel + theme toggle + sound settings (local apply + upload wav/mp3)
- `client/src/pages/TeamScreen.tsx` - Team bidding + registration + hook
- `client/src/pages/ScoreboardScreen.tsx` - Overhauled leaderboard + hook
- `client/src/pages/DisplayScreen.tsx` - Legacy display + hook
- `client/src/hooks/useSoundSystem.ts` - Central event→sound bindings
- `client/src/utils/soundManager.ts` - Singleton audio controller
- `client/src/App.tsx` - Global sound unlock install
- `client/src/theme.css`, `client/src/design-system.ts`, `client/src/contexts/ThemeContext.tsx`

## Socket Events
- `admin:sound_settings` → `sound:settings`
- `admin:sound_per_setting` → `sound:per_setting`
- `sound:auction_started|bid_updated|bid_won|timer_stopped|task_result` mirrors consumed by useSoundSystem
- `timer:end`, `task:result`, `result:declared`, `phase:changed` drive sounds
- `admin:theme` → `theme:changed`

## Git Status
- Branch: master
- Pushed to: https://github.com/RudraMistry-cmd/auction-quiz.git
