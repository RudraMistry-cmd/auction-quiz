import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { ServerEvents, ClientEvents } from "../shared/types";

export function getServerBase(): string {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "") {
    return "http://localhost:3000";
  }
  return `http://${host}:3000`;
}

type TypedSocket = Socket<ServerEvents, ClientEvents>;

/**
 * Offset between this device's clock and the server's (serverTime - localTime).
 * Timers are broadcast as server timestamps, so any device whose clock differs
 * from the host's would otherwise count down from a different zero — which
 * reads on screen as two timers fighting each other.
 */
let serverTimeOffset = 0;

export function serverNow(): number {
  return Date.now() + serverTimeOffset;
}

/**
 * Probe the server clock a few times and keep the estimate from the fastest
 * round trip, where the one-way delay assumption (rtt/2) is least wrong.
 *
 * Each probe is individually timed out: a socket.io ack that never arrives
 * (lost packet, a congested LAN, a slow/asymmetric link) would otherwise
 * stall this forever, since the original version only ever scheduled the
 * next probe — and only ever applied the result — from inside the previous
 * ack's callback. Under real latency that's exactly the failure mode that
 * reproduces the clock-mismatch timer glitch this function exists to fix.
 * Here, a stalled probe is abandoned after PROBE_TIMEOUT_MS and counted as a
 * miss so the chain keeps moving, and the offset is always finalized once
 * the attempt budget runs out — using whatever best sample was gathered,
 * even if some or all probes failed.
 */
const PROBE_TIMEOUT_MS = 800;
const PROBE_INTERVAL_MS = 120;

export function syncServerClock(socket: TypedSocket, samples = 5): void {
  const maxAttempts = samples * 2; // budget for retries past outright losses
  let bestRtt = Infinity;
  let bestOffset = serverTimeOffset;
  let successes = 0;
  let attempts = 0;
  let settled = false;

  const finish = () => {
    if (settled) return;
    settled = true;
    serverTimeOffset = bestOffset;
  };

  const probe = () => {
    if (successes >= samples || attempts >= maxAttempts) {
      finish();
      return;
    }
    attempts++;

    let done = false;
    const sentAt = Date.now();
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      probe(); // this attempt was lost — move on rather than hang forever
    }, PROBE_TIMEOUT_MS);

    socket.emit("time:sync", (res) => {
      if (done) return; // arrived after we already gave up on it
      done = true;
      clearTimeout(timer);

      const receivedAt = Date.now();
      if (typeof res?.serverTime === "number") {
        const rtt = receivedAt - sentAt;
        if (rtt < bestRtt) {
          bestRtt = rtt;
          bestOffset = res.serverTime + rtt / 2 - receivedAt;
        }
        successes++;
      }

      setTimeout(probe, PROBE_INTERVAL_MS);
    });
  };

  probe();
}

export function useSocket() {
  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s: TypedSocket = io(getServerBase(), {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
      auth: {
        adminSecret: sessionStorage.getItem("adminSecret") || undefined,
        secret: sessionStorage.getItem("adminSecret") || undefined,
      },
    });

    setSocket(s);

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    s.on("connect", handleConnect);
    s.on("disconnect", handleDisconnect);
    s.on("connect_error", handleDisconnect);

    return () => {
      s.off("connect", handleConnect);
      s.off("disconnect", handleDisconnect);
      s.off("connect_error", handleDisconnect);
      s.disconnect();
      setSocket(null);
    };
  }, []);

  return { socket, connected };
}
