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
 */
export function syncServerClock(socket: TypedSocket, samples = 5): void {
  let bestRtt = Infinity;
  let bestOffset = serverTimeOffset;
  let taken = 0;

  const probe = () => {
    const sentAt = Date.now();
    socket.emit("time:sync", (res) => {
      const receivedAt = Date.now();
      if (typeof res?.serverTime !== "number") return;

      const rtt = receivedAt - sentAt;
      if (rtt < bestRtt) {
        bestRtt = rtt;
        bestOffset = res.serverTime + rtt / 2 - receivedAt;
      }

      if (++taken < samples) {
        setTimeout(probe, 120);
      } else {
        serverTimeOffset = bestOffset;
      }
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
