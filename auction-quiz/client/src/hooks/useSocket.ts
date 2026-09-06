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

export function useSocket() {
  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s: TypedSocket = io(getServerBase(), {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
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
