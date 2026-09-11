# Project Context

## Environment
- TS monorepo `auction-quiz/` (client React+Vite, server Express+Socket.IO). Admin secret `7f8a9b2c`. Branch `master`, remote `https://github.com/RudraMistry-cmd/auction-quiz.git`.

## Current Status
- Scoreboard overhaul DONE + PUSHED: 80px header matching Team/Live; centered top-5 (POINTS→COINS→name); system-color badges/cards; socket+polling updates; subtle animations; "Waiting for results..." empty state.
- Sound engine DONE + PUSHED: `client/.../utils/soundManager.ts` (canonical+legacy/short aliases incl. bid/win/lose; extensionless bases probed .mp3→.wav, multi-source chains; preload-once dict; throttle+dedupe; volume norm; localStorage persist; once-only missing warn; unlock warms elements) + `hooks/useSoundSystem.ts` (mounted ONLY in LiveAuctionScreen). Server `/api/sounds` resolves newest .mp3/.wav; upload ext-aware w/ sibling replace. Client+server tsc clean.
- Playback = Live Display ONLY: hook stripped from App/Team/Scoreboard/legacy Display/Admin; Admin keeps control-plane only + emit-only "Sound Test → Live Display" panel; Live Display has "🔊 Enable Sound" pill + gesture fallback.
- Unified `sound:play` bus DONE + PUSHED: server relay validates/rebroadcasts {type[,id]}; companion emits at bid (bid), win (win), 9× timer_stopped (timer_end), 7× task_result incl. dynamic site (pass/fail), auction start/end. In ServerEvents+ClientEvents in all 3 types.ts. Display `onSoundBus` dedupes (500ms bucket/600ms TTL; timer_end exactly-once).
- PUSHED commit `03168d1` (33 files, +1641/−926): all above + wav assets + `sounds1/` mp3 dup dir + pre-existing timer-engine safety changes + context files. Follow-up commit `eb2ab6c` ("chore: sync team pool csv") pushed the team_pool.csv row deletions too, per user request. Tree is clean.
- No fs.watch/Vite watchers; audio via static `/sounds/…` URLs only.

## Pending Tasks
- None. (Restart Vite dev after manually adding sound files.)
