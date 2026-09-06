# Project Context — auction-quiz (LAN realtime auction, college event)

## Environment
- Server: Node 24, Express, Socket.IO, sql.js, TS. 0.0.0.0:3000 (tsx watch, hot-reloads). DB: server/data/auction.db. Deps: xlsx, multer, @types/multer.
- Client: React + TS + Vite + socket.io-client + react-router-dom on :5173.
- Root: D:\Projects\College\auc-c\auction-quiz\ | shared types: shared/types.ts (copied to server/src/types.ts, client/src/shared/types.ts). Sample bank: docs/quiz-questions.xlsx (30 rows: 10 easy@10, 10 med@25, 10 hard@50).

## Routes (:5173)
/team | /admin | /display (chooser) | /display/live | /display/scores | /display/legacy | * NotFound.

## Current Status
DONE (server tsc + client build pass; state machine 12/12; tx + migrations verified by execution):
- Full lifecycle register→auction→task→verdict→idle; phase machine; task.service (assign/timer/pause/resume/adjust/restart, transactional submitResult + idempotent replay + idle re-verdict, undo 30s); boot reconcile; version stamps.
- QUESTION ENGINE: Excel import, questions+settings tables, pools, idle-only select with burn, strict start-requires-selection + atomic takeSelection, task inherits bank fields, question:active at start+assign, question:selected broadcast.
- Win-time settlement: finishAuction transactionally deducts min(coins,finalBid), stores auctions.finalBid; submitResult moves only points; undo = pre-verdict restore (no code change needed). TeamScreen header shows Coins (gold) + Score (violet), red/green pulse flashes, authoritative sync on ended/result/reconnect. Admin FAIL text fixed.
- Frontend: useGamePhase() all screens (upcoming/activeQuestion, hasLiveTaskEvent flag + version guard); QuestionView shared renderer; TaskStage; Admin bank dropdown flow (difficulty→questions, confirm-gated) + Task Control Panel; auction:cleared event wipes bid/leader/timer/winner UI everywhere (task/question untouched), "No active auction" / "Waiting for next auction" copy.
- Theme tokens + keyframes. ADMIN_KEY via $env. Hard-refresh tabs.

## GitHub — DONE
- Repo: https://github.com/RudraMistry-cmd/auction-quiz (private, branch master tracks origin/master). Commit 99f0b6b pushed.
- Portable gh 2.100.0 kept at C:\Users\RUDRAM~1\AppData\Local\Temp\opencode\ghcli\bin\gh.exe, already authed as RudraMistry-cmd — reuse for future pushes.
- Dead background tasks (ignore): task_52012584, task_242a1c2f, task_178990e2, task_c203bd2f, task_1bc656eb, job_05b89923, job_f911ddc4, job_8f4af27b (gh login, done). .opencode/todo.md complete.

## Pending Tasks (besides push)
- None requested. Possible: reset-auctions-only script; event-day runbook (hotspot, no sleep, firewall).
