import { useEffect, useRef } from "react";
import type { Socket } from "socket.io-client";
import { soundManager } from "../utils/soundManager";

/**
 * Central event→sound binding. Mount ONCE per screen (Admin, Team, Live,
 * Scoreboard, legacy Display) with that screen's socket.
 *
 * - Sounds fire ONLY from socket events, never from render/state checks.
 * - Every trigger is deduped (same logical event via game event + server
 *   sound:* mirror plays exactly once) and throttled in the manager.
 * - Timer-end uses a cross-source "played recently" guard so it fires once.
 * - Last-10-seconds ticks come from socket timer events (not render loops),
 *   covering the auction timer, the task timer, and the extra/fallback timer.
 */

type AnySocket = Pick<Socket, "on" | "off"> | null | undefined;

const DEDUPE_TTL = 2500;
const TIMER_END_GUARD_MS = 3500;
const TASK_RESULT_GUARD_MS = 2500;
const FALLBACK_GUARD_MS = 6000;

export function useSoundSystem(socket: AnySocket): void {
  const lastTimerEnd = useRef(0);
  const lastTaskResultAt = useRef(0);
  const lastFallbackAt = useRef(0);
  const lastAuctionStartAt = useRef(0);

  useEffect(() => {
    if (!socket) return;
    const s = socket as Socket;

    const playTimerEndOnce = () => {
      const now = Date.now();
      if (now - lastTimerEnd.current < TIMER_END_GUARD_MS) return;
      lastTimerEnd.current = now;
      soundManager.playUnique(`timer-end@${now}`, "timer_end", TIMER_END_GUARD_MS);
    };

    const playAuctionStartOnce = (key: string) => {
      const now = Date.now();
      if (now - lastAuctionStartAt.current < DEDUPE_TTL) return;
      lastAuctionStartAt.current = now;
      soundManager.playUnique(key, "auction_start", DEDUPE_TTL);
    };

    const playFallbackOnce = (key: string) => {
      const now = Date.now();
      if (now - lastFallbackAt.current < FALLBACK_GUARD_MS) return;
      lastFallbackAt.current = now;
      soundManager.playUnique(key, "fallback_start", FALLBACK_GUARD_MS);
    };

    const playTaskResult = (result: string, key: string) => {
      const pass = result === "pass" || result === "fallback_pass";
      lastTaskResultAt.current = Date.now();
      soundManager.playUnique(key, pass ? "task_pass" : "task_fail", TASK_RESULT_GUARD_MS);
    };

    /* ── Game events → sounds ── */
    const onAuctionStart = (a?: any) =>
      playAuctionStartOnce(`auction-start:${a?.auctionId ?? "live"}`);
    const onBidUpdate = (d?: any) =>
      soundManager.playUnique(
        `bid:${d?.auctionId ?? "?"}:${d?.bid?.amount ?? "?"}:${d?.teamName ?? "?"}`,
        "bid_placed",
        2000
      );
    const onBidWin = (d?: any) => {
      if (d && "winner" in d && !d.winner) return; // no-winner end → no win jingle
      const w = d?.winner ?? d ?? {};
      soundManager.playUnique(
        `win:${w.teamId ?? w.teamName ?? "?"}:${d?.winningBid ?? d?.bid ?? "?"}`,
        "bid_win",
        DEDUPE_TTL
      );
    };
    const onTimerEnd = () => playTimerEndOnce();
    const onTaskResult = (d?: any) => {
      if (!d?.result) return;
      playTaskResult(d.result, `task:${d.taskId ?? d.teamId ?? d.teamName ?? d.result}`);
    };
    const onResultDeclared = (d?: any) => {
      if (!d?.result) return;
      // task:result already covered this verdict → don't double-play.
      if (Date.now() - lastTaskResultAt.current < TASK_RESULT_GUARD_MS) return;
      const pass = d.result === "pass" || d.result === "fallback_pass";
      soundManager.playUnique(
        `result:${d.teamName ?? "?"}:${d.result}:${d.points ?? "?"}`,
        pass ? "task_pass" : "task_fail",
        DEDUPE_TTL
      );
      lastTaskResultAt.current = Date.now();
    };
    const onPhaseChanged = (d?: any) => {
      if (d?.phase === "fallback_idle" || d?.phase === "fallback_active") {
        playFallbackOnce(`fallback:phase:${d.phase}`);
      }
    };
    const onExtraTimerStart = () => playFallbackOnce("fallback:extra-start");

    // Last-10-seconds ticks from socket timer events (event-driven, throttled).
    const onAuctionTimer = (d?: any) => {
      const r = d?.remaining;
      if (typeof r === "number" && r <= 10 && r > 0) {
        soundManager.playUnique(`tick:auction:${r}`, "timer_tick", 1200);
      }
      if (r === 0) playTimerEndOnce();
    };
    const onTaskTimer = (d?: any) => {
      const r = d?.timeLeft;
      if (typeof r === "number" && r <= 10 && r > 0) {
        soundManager.playUnique(`tick:task:${d.taskId ?? "?"}:${r}`, "timer_tick", 1200);
      }
      if (r === 0) playTimerEndOnce();
    };
    // The extra/fallback timer has no dedicated per-second event; it rides the
    // generic timer:update heartbeat (emitted every second for all timers).
    const onTimerUpdateTick = (d?: any) => {
      const extra = d?.explicitTimer ?? d?.extraTimer ?? d?.sideTaskTimer;
      const r = extra?.remaining;
      if (extra?.isRunning && typeof r === "number" && r <= 10 && r > 0) {
        soundManager.playUnique(`tick:extra:${r}`, "timer_tick", 1200);
      }
    };
    // Fired whenever the admin manually starts a timer (task or extra/side).
    const onSrvTimerStarted = () => soundManager.play("timer_start");

    /* ── Global sound bus: triggers from anywhere, played ONLY here
         (this hook is mounted solely on the Live Display) ── */
    const onSoundBus = (d?: any) => {
      const type = typeof d?.type === "string" ? d.type.trim() : "";
      if (!type) return;
      // Timer-end via bus shares the exactly-once guard.
      if (type === "timer_end") {
        playTimerEndOnce();
        return;
      }
      // Same 500ms delivery window (server fan-out + relay) plays once;
      // intentional repeats still sound. Per-sound throttle is second layer.
      const key = d?.id
        ? `bus:${type}:${d.id}`
        : `bus:${type}:${Math.floor(Date.now() / 500)}`;
      soundManager.playUnique(key, type, 600);
    };

    /* ── Server sound:* mirrors (same guards → no doubles) ── */
    const onSrvAuctionStarted = () => playAuctionStartOnce("srv:auction-started");
    const onSrvBidUpdated = (d?: any) =>
      soundManager.playUnique(
        `bid:${d?.teamName ?? "?"}:${d?.bidAmount ?? "?"}:${d?.increment ?? "?"}`,
        "bid_placed",
        2000
      );
    const onSrvBidWon = (d?: any) =>
      soundManager.playUnique(
        `win:${d?.teamName ?? "?"}:${d?.bidAmount ?? "?"}`,
        "bid_win",
        DEDUPE_TTL
      );
    const onSrvTimerStopped = () => playTimerEndOnce();
    const onSrvTaskResult = (d?: any) => {
      if (!d?.result) return;
      const now = Date.now();
      if (now - lastTaskResultAt.current < TASK_RESULT_GUARD_MS) return;
      playTaskResult(d.result, `srv:task:${d.result}`);
    };
    const onSrvSettings = (d?: any) => {
      if (!d || typeof d.enabled !== "boolean") return;
      const v = Number(d.volume);
      soundManager.applySettings({
        enabled: d.enabled,
        volume: Number.isFinite(v) ? v : soundManager.getVolume(),
      });
    };
    const onSrvPerSetting = (d?: any) => {
      if (!d || typeof d.soundName !== "string" || typeof d.enabled !== "boolean") return;
      soundManager.setPerSoundEnabled(d.soundName, d.enabled);
    };

    const E: Array<[string, (...args: any[]) => void]> = [
      ["auction:started", onAuctionStart],
      ["auction:start", onAuctionStart],
      ["auction:bid_update", onBidUpdate],
      ["bid:update", onBidUpdate],
      ["auction:ended", onBidWin],
      ["auction:win", onBidWin],
      ["bid:win", onBidWin],
      ["timer:end", onTimerEnd],
      ["task:result", onTaskResult],
      ["result:declared", onResultDeclared],
      ["phase:changed", onPhaseChanged],
      ["timer:extra:start", onExtraTimerStart],
      ["timer:explicit:start", onExtraTimerStart],
      ["timer:side:start", onExtraTimerStart],
      ["auction:timer", onAuctionTimer],
      ["task:timer", onTaskTimer],
      ["timer:update", onTimerUpdateTick],
      ["sound:play", onSoundBus],
      ["sound:auction_started", onSrvAuctionStarted],
      ["sound:bid_updated", onSrvBidUpdated],
      ["sound:bid_won", onSrvBidWon],
      ["sound:timer_started", onSrvTimerStarted],
      ["sound:timer_stopped", onSrvTimerStopped],
      ["sound:task_result", onSrvTaskResult],
      ["sound:settings", onSrvSettings],
      ["sound:per_setting", onSrvPerSetting],
    ];
    for (const [ev, fn] of E) s.on(ev as any, fn as any);
    return () => {
      for (const [ev, fn] of E) s.off(ev as any, fn as any);
    };
  }, [socket]);
}
