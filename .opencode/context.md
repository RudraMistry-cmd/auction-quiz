# Project Context — auction-quiz (LAN realtime auction, college event)

## Environment
- Server: Node 24, Express, Socket.IO, sql.js, TS. 0.0.0.0:3000 (tsx watch, hot-reloads). DB: server/data/auction.db. Deps: xlsx, multer, @types/multer.
- Client: React + TS + Vite + socket.io-client + react-router-dom on :5173.
- Root: D:\Projects\College\auc-c\auction-quiz\ | shared types: shared/types.ts (copied to server/src/types.ts, client/src/shared/types.ts). Sample bank: docs/quiz-questions.xlsx (30 rows: 10 easy@10, 10 med@25, 10 hard@50).

## Routes (:5173)
/team | /admin | /display (chooser) | /display/live | /display/scores | /display/legacy | * NotFound.

## Current Status
DONE (server tsc + client build pass; state machine 12/12; tx + migrations verified by execution):
- Lifecycle: register → auction (50/10/60s, 800ms limit, winner re-bid rule, NO settlement) → task (300s) → verdict → idle.
- phase.service.ts machine (idle/auction/task). task.service.ts: assignTask (bank question/reward/options/questionId); timer + pause/resume/adjust/restart; submitResult transactional + idempotent + idle re-verdict, PASS default = explicit ?? bank default, validation integer >= 0 (no cap); undo restores + resets task row, 30s idle-only; boot reconcile. Version stamps.
- QUESTION ENGINE: import (POST /api/questions/import?mode=append|overwrite, admin key, 5MB, per-row validation incl. empty-reward rejection); questions + settings tables; pools via admin:get_questions (+selected); admin:select_question (idle-only, burn-on-select) + broadcasts question:selected; ATOMIC takeSelection() (read+clear under question lock; beginAuction→take→compensate-to-idle on empty); startAuction REQUIRES selection + attaches questionId; assignTask throws if missing; question:active at auction start AND task assign (QuestionPayload, taskId optional); getPublicState + reconnect carry activeQuestion (bank options) + upcomingQuestion. No FK on questionId. ensureColumn migrations incl. tasks.options.
- Socket: full task/admin/question event set; task:ended only on real transition; /api/auction/start (admin key). Reconnect + snapshot carry phase/activeTask/timers/questions.
- Frontend: useGamePhase() all screens (upcomingQuestion/activeQuestion state; selected/active handlers noting structural; snapshot restore; hasLiveTaskEvent per-fetch flag + version>=seen). QuestionView shared renderer (tiers, code panels, MCQ grid, reward pill, scroll). TaskStage + Team task views show question/options/reward. Team auction view shows round question (live event, else auction-row fallback) + Next-up panel when idle. Live + legacy Display idle show Next-up panel. Admin: bank import UI, trimmed previews, 2-step Select + lock/Change, full selected QuestionView, empty-bank warning, Task Control (timer row, pre-filled PASS, 2-step FAIL, UNDO countdown).
- Theme tokens + bidPop/fadeSlideIn. Live test data exists (teams "1","2"). ADMIN_KEY via $env. Hard-refresh tabs. Import route verified live; full import cycle untested vs live DB (deliberate).
- Dead background tasks (ignore): task_52012584, task_242a1c2f, task_178990e2, task_c203bd2f, task_1bc656eb, job_05b89923. .opencode/todo.md complete.

## Pending Tasks
- None requested. Possible: reset-auctions-only script; event-day runbook (hotspot, no sleep, firewall).

## 2026-09-06 — Admin dropdown selection flow
- Question Bank pool lists replaced with stepped dropdowns: 1) difficulty (Easy/Medium/Hard + counts), 2) questions of that difficulty as "preview… [pts]" (disabled until difficulty chosen; "No questions left in this category" when empty). Unused-only pools flow from server unchanged.
- Flow: pick difficulty → pick question → "Select Question" → inline Confirm/Cancel → success resets picker, selected readout shows full QuestionView. Lock/Change/per-row-confirm machinery removed. Unused pool-row styles left in file (no runtime effect).

## 2026-09-06 — Win-time settlement + team finance UI
- RULE CHANGE: winner pays finalBid immediately in finishAuction (transactional BEGIN/COMMIT/ROLLBACK, clamp >= 0, finalBid stored on auctions row via new column + ensureColumn). submitResult moves ONLY points now (FAIL deducts nothing; coinsDeducted recorded 0). Undo unchanged and still correct (restores pre-verdict snapshot: PASS-undo removes grant, FAIL-undo is balance-neutral but voids for re-submit).
- TeamScreen: header shows Coins (gold) + Score in points (violet) on both task and main views; coins mirror win deduction instantly on auction:ended with red pulse flash; task:result sets both balances authoritatively + green flash on points gain; FAIL message no longer claims coin loss; balances refresh on register/reconnect.
- AdminScreen FAIL confirm reworded (bid already paid at win, FAIL denies points only).
- NOTE: balances from rounds played under old rules stay as-is; new rule applies going forward.

## 2026-09-06 — Question-always-visible pass
- QuestionView: new optional maxHeight prop (default 46vh/30vh compact).
- LiveAuctionScreen + DisplayScreen (legacy): question band (QuestionView, 24vh cap) above the bid row during live auctions; stage switched to column layout; data = activeQuestion ?? auction-row fallback.
- TeamScreen: round question block in auction view + Next-up panel when idle.
- AdminScreen: Start Auction is now 2-step (arm → confirm naming the question) + gold hint + blocked without selection; armed state resets on auction start. Server already rejected start-without-question; ticker still surfaces it.
- Question never disappears: waiting/upcoming → auction band → task view (TaskStage) across team/live/legacy screens.
