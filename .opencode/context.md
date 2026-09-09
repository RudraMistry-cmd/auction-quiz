# Project Context

## Environment
- TS monorepo `auction-quiz/` (client React+Vite, server Express+Socket.IO). Admin secret `7f8a9b2c`.

## Current Status
- Scoreboard overhaul DONE (`client/.../ScoreboardScreen.tsx`): 80px header matching Team/Live; centered top-5 (sort POINTS→COINS→name); system-color badges/cards; socket+polling updates; subtle animations; "Waiting for results..." empty state.
- Sound engine DONE (`client/.../utils/soundManager.ts` + `hooks/useSoundSystem.ts`): canonical types + legacy/short aliases (bid/win/lose/pass/fail/timer_end/...); extensionless bases probed .mp3→.wav with multi-source chains; preload-once HTMLAudioElement dict; throttle + playUnique dedupe; volume normalization; localStorage persist; once-only missing-file warn; unlock() warms each element (play→pause→reset). Server `/api/sounds` resolves newest .mp3/.wav, upload ext-aware w/ sibling replace. Client+server tsc clean.
- ARCHITECTURE RULE — playback = Live Display ONLY (verified by grep; no play/unlock outside Live + manager/hook internals):
  - `useSoundSystem` mounted solely in `LiveAuctionScreen.tsx`; stripped from App/Team/Scoreboard/legacy Display/Admin. Admin keeps control-plane only (applySettings/setPerSoundEnabled/persisted init).
  - Live Display has gold "🔊 Enable Sound" pill (hidden after first interaction) + once-only pointerdown/keydown unlock fallback.
- Unified `sound:play` bus DONE: server relay `socket.on("sound:play")` validates {type[,id]} and rebroadcasts; companion `io.emit("sound:play")` at bid (bid), win (win), all 9 timer_stopped (timer_end), all 7 task_result incl. dynamic submit-result site (pass/fail), auction start/end. Added to ServerEvents+ClientEvents in all 3 types.ts (server, client, root shared). Display `onSoundBus` dedupes (500ms bucket/600ms TTL, timer_end via exactly-once guard). Admin "Sound Test → Live Display" panel is emit-only. (Fixed a double-insertion at 2 timer-callback sites.)
- No `fs.watch`/custom Vite watchers; audio via static `/sounds/…` URLs only.

## Pending Tasks
- None. (Note: restart Vite dev after manually adding sound files.)
