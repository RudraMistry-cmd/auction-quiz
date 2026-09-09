import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { setupSocketHandlers } from "./handlers/socket.handler";
import { getDb, closeDb } from "./db/database";
import { auctionService } from "./services/auction.service";
import { taskService } from "./services/task.service";
import { questionService } from "./services/question.service";
import { manualTimerService } from "./services/manual-timer.service";
import { teamService } from "./services/team.service";
import { teamPoolService } from "./services/team-pool.service";
import { ADMIN_SECRET, ALLOW_REMOTE_ADMIN, isLocalOrHostIp } from "./auth";

const PORT = parseInt(process.env.PORT || "3000", 10);

// Never let one bad request kill the event.
process.on("unhandledRejection", (reason) => {
  console.error("[Server] Unhandled rejection (server kept alive):", reason);
});

async function main() {
  // Initialize database
  await getDb();
  await teamPoolService.init();
  await auctionService.init();
  // Close any auction/task left active by a restart before the event continues.
  await auctionService.reconcileOnBoot();
  await taskService.reconcileOnBoot();
  await questionService.init();

  const app = express();
  const httpServer = createServer(app);

  app.use(cors({ origin: "*", methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"] }));
  app.use(express.json());

  // Serve question images from /questions folder
  app.use("/questions", express.static(path.join(__dirname, "../../questions")));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 30000,
    pingInterval: 10000,
  });

  const auctionControl = setupSocketHandlers(io);

  // Middleware: Only localhost/host IP with the secret can access admin HTTP endpoints
  const adminHttpAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const secret = req.header("x-admin-secret") || req.header("x-admin-key") || req.query.secret;
    const clientIp = req.socket.remoteAddress || req.ip;
    const isHost = isLocalOrHostIp(clientIp);

    if (!isHost && !ALLOW_REMOTE_ADMIN) {
      console.warn(`[HTTP] Blocked admin access from non-host IP: ${clientIp}`);
      res.status(403).json({ success: false, error: "Admin access allowed only from localhost or host IP" });
      return;
    }

    if (secret !== ADMIN_SECRET) {
      console.warn(`[HTTP] Blocked admin access with invalid secret from: ${clientIp}`);
      res.status(403).json({ success: false, error: "Unauthorized: Invalid admin secret" });
      return;
    }

    next();
  };

  app.post("/api/auction/start", adminHttpAuth, async (req, res) => {
    try {
      const { question, defaultReward } = req.body ?? {};
      const auction = await auctionControl.startAuction({ question, defaultReward });
      res.json({ success: true, auction });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.get("/api/scoreboard", async (_req, res) => {
    const { teamService } = require("./services/team.service");
    const scoreboard = await teamService.getScoreboard();
    res.json({ teams: scoreboard });
  });

  // Public snapshot for display/admin screens (e.g. after a page refresh).
  app.get("/api/auction/current", async (_req, res) => {
    try {
      res.json(await auctionService.getPublicState());
    } catch (err: any) {
      res.status(500).json({ auction: null, error: err.message });
    }
  });

  // Full sync state endpoint for polling fallback or initial load
  const getStateHandler = async (_req: express.Request, res: express.Response) => {
    try {
      const fullState = await auctionControl.getFullSyncState();
      res.json(fullState);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  app.get("/state", getStateHandler);
  app.get("/api/state", getStateHandler);

  // Manual timer state for display refresh
  app.get("/api/timer", (_req, res) => {
    try {
      res.json(manualTimerService.getState());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Sound file management
  const soundsDir = path.join(__dirname, "../../client/public/sounds");
  const fs = require("fs");

  // Audio formats accepted everywhere (upload, listing, playback).
  const SOUND_EXTS = [".mp3", ".wav"] as const;

  // Resolve the playable file for a sound name: whichever of
  // <name>.mp3 / <name>.wav exists (newest wins when both exist).
  const resolveSoundFile = (name: string): { exists: boolean; ext: string | null; path: string } => {
    let best: { ext: string; mtime: number } | null = null;
    for (const ext of SOUND_EXTS) {
      const fp = path.join(soundsDir, `${name}${ext}`);
      if (fs.existsSync(fp)) {
        let mtime = 0;
        try {
          mtime = fs.statSync(fp).mtimeMs;
        } catch {
          mtime = 0;
        }
        if (!best || mtime >= best.mtime) best = { ext, mtime };
      }
    }
    if (!best) return { exists: false, ext: null, path: `/sounds/${name}.mp3` };
    return { exists: true, ext: best.ext, path: `/sounds/${name}${best.ext}` };
  };

  // List available sound files
  app.get("/api/sounds", adminHttpAuth, (_req, res) => {
    try {
      const soundNames = [
        "auction_start", "auction_end", "bid_small", "bid_big", "bid_win",
        "timer_start", "timer_end", "pass", "fail", "tick"
      ];
      const files = soundNames.map((name) => ({ name, ...resolveSoundFile(name) }));
      res.json({ success: true, sounds: files });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Upload a sound file (raw audio body; .mp3 or .wav)
  app.post("/api/sounds/upload", adminHttpAuth, express.raw({ type: "audio/*", limit: "5mb" }), (req, res) => {
    try {
      const soundName = req.query.name as string;
      if (!soundName || !/^[a-z_]+$/.test(soundName)) {
        res.status(400).json({ success: false, error: "Invalid sound name" });
        return;
      }
      if (!req.body || req.body.length === 0) {
        res.status(400).json({ success: false, error: "No file data" });
        return;
      }
      // Decide extension: explicit ?ext= wins, else sniff Content-Type.
      const rawExt = String(req.query.ext || "").toLowerCase();
      const ctype = String(req.headers["content-type"] || "").toLowerCase();
      let ext = ".mp3";
      if (rawExt === "wav" || rawExt === ".wav") ext = ".wav";
      else if (rawExt === "mp3" || rawExt === ".mp3") ext = ".mp3";
      else if (ctype.includes("wav") || ctype.includes("wave")) ext = ".wav";
      else if (ctype.includes("mpeg") || ctype.includes("mp3")) ext = ".mp3";
      if (!SOUND_EXTS.includes(ext as any)) {
        res.status(400).json({ success: false, error: "Only .mp3 and .wav are supported" });
        return;
      }
      if (!fs.existsSync(soundsDir)) {
        fs.mkdirSync(soundsDir, { recursive: true });
      }
      const filePath = path.join(soundsDir, `${soundName}${ext}`);
      fs.writeFileSync(filePath, req.body);
      // Remove the sibling extension so the fresh upload is unambiguous.
      for (const other of SOUND_EXTS) {
        if (other !== ext) {
          const sibling = path.join(soundsDir, `${soundName}${other}`);
          if (fs.existsSync(sibling)) {
            try {
              fs.unlinkSync(sibling);
            } catch {
              /* ignore */
            }
          }
        }
      }
      console.log(`[Sound] Uploaded: ${soundName}${ext} (${req.body.length} bytes)`);
      res.json({ success: true, name: soundName, ext, path: `/sounds/${soundName}${ext}` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ─── Admin: Team Data Management ───

  // GET /admin/teams - Fetch all teams
  app.get("/admin/teams", adminHttpAuth, async (_req, res) => {
    try {
      const teams = await teamService.getAllTeams();
      res.json({ success: true, teams });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PATCH /admin/team/:id - Update team fields
  app.patch("/admin/team/:id", adminHttpAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { bid_coins, reward_points, email, phone } = req.body ?? {};

      const result = await teamService.updateTeam(id, {
        bid_coins,
        reward_points,
        email,
        phone,
      });

      if ("error" in result) {
        res.status(400).json({ success: false, error: result.error });
        return;
      }

      // Sync updated coins/points with all connected screens
      const scoreboard = await teamService.getScoreboard();
      io.emit("scoreboard:update", { teams: scoreboard });
      io.emit("scoreboard:updated", { teams: scoreboard });
      if (result.team) {
        io.emit("team:update", { team: result.team });
      }
      await auctionControl.broadcastFullState();

      res.json({ success: true, team: result.team });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /admin/team/:id - Delete team completely from database
  const deleteTeamHandler = async (req: express.Request, res: express.Response) => {
    try {
      const { id } = req.params;
      const result = await teamService.deleteTeam(id);
      if (!result.success) {
        res.status(404).json({ success: false, error: result.error });
        return;
      }

      // Sync scoreboard with all connected clients
      const scoreboard = await teamService.getScoreboard();
      io.emit("scoreboard:update", { teams: scoreboard });
      io.emit("scoreboard:updated", { teams: scoreboard });
      await auctionControl.broadcastFullState();

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  app.delete("/admin/team/:id", adminHttpAuth, deleteTeamHandler);
  app.delete("/admin/teams/:id", adminHttpAuth, deleteTeamHandler);

  // GET /admin/team-pool - Fetch pool statistics
  app.get("/admin/team-pool", adminHttpAuth, async (_req, res) => {
    try {
      const stats = await teamPoolService.getPoolStats();
      res.json({ success: true, stats });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /admin/team-pool/reset - Reset pool assignments for unallocated teams
  app.post("/admin/team-pool/reset", adminHttpAuth, async (_req, res) => {
    try {
      const stats = await teamPoolService.resetPool();
      io.emit("team_pool:update", stats as any);
      res.json({ success: true, stats });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`\n========================================`);
    console.log(`  Auction Quiz Server`);
    console.log(`  Running on http://0.0.0.0:${PORT}`);
    console.log(`  LAN access: use your machine's IP`);
    console.log(`========================================\n`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("\n[Server] Shutting down...");
  closeDb();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[Server] Shutting down...");
  closeDb();
  process.exit(0);
});
