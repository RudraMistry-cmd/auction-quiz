import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { setupSocketHandlers } from "./handlers/socket.handler";
import { getDb, closeDb } from "./db/database";
import { auctionService } from "./services/auction.service";
import { taskService } from "./services/task.service";
import { questionService } from "./services/question.service";
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

const PORT = parseInt(process.env.PORT || "3000", 10);
const ADMIN_KEY = process.env.ADMIN_KEY || "auction-admin";

if (!process.env.ADMIN_KEY) {
  console.warn("[Server] WARNING: ADMIN_KEY not set — using default. Set ADMIN_KEY env var for live events.");
}

// Never let one bad request kill the event.
process.on("unhandledRejection", (reason) => {
  console.error("[Server] Unhandled rejection (server kept alive):", reason);
});

async function main() {
  // Initialize database
  await getDb();
  await auctionService.init();
  // Close any auction/task left active by a restart before the event continues.
  await auctionService.reconcileOnBoot();
  await taskService.reconcileOnBoot();
  await questionService.init();

  const app = express();
  const httpServer = createServer(app);

  app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 30000,
    pingInterval: 10000,
  });

  const auctionControl = setupSocketHandlers(io);

  app.post("/api/auction/start", async (req, res) => {
    if (req.header("x-admin-key") !== ADMIN_KEY) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }
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

  // Question bank import (admin only). Modes: append (default) | overwrite.
  app.post("/api/questions/import", upload.single("file"), async (req, res) => {
    if (req.header("x-admin-key") !== ADMIN_KEY) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: "Missing file field 'file' (.xlsx)" });
        return;
      }
      const mode = req.query.mode === "overwrite" ? "overwrite" : "append";
      res.json(await questionService.importExcel(req.file.buffer, mode));
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || "Import failed" });
    }
  });

  // Public snapshot for display/admin screens (e.g. after a page refresh).
  app.get("/api/auction/current", async (_req, res) => {
    try {
      res.json(await auctionService.getPublicState());
    } catch (err: any) {
      res.status(500).json({ auction: null, error: err.message });
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
