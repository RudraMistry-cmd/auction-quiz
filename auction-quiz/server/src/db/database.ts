import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import fs from "fs";
import path from "path";

const DB_PATH = path.join(__dirname, "..", "..", "data", "auction.db");

let db: SqlJsDatabase | null = null;
let saveInterval: NodeJS.Timeout | null = null;

export function persistDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

export async function getDb(): Promise<SqlJsDatabase> {
  if (db) return db;

  const SQL = await initSqlJs();

  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Load existing DB or create new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run("PRAGMA foreign_keys = ON");
  initTables(db);
  migrateTaskResults(db);
  // Additive columns for question + default reward (existing rows keep working).
  ensureColumn(db, "auctions", "question", "TEXT");
  ensureColumn(db, "auctions", "defaultReward", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "auctions", "questionId", "TEXT");
  ensureColumn(db, "auctions", "finalBid", "INTEGER");
  ensureColumn(db, "tasks", "question", "TEXT");
  ensureColumn(db, "tasks", "defaultReward", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "tasks", "questionId", "TEXT");
  ensureColumn(db, "tasks", "options", "TEXT");

  // Auto-save every 5 seconds (safety net — mutations persist immediately)
  saveInterval = setInterval(persistDb, 5000);

  return db;
}

function initTables(db: SqlJsDatabase) {
  db.run(`
    CREATE TABLE IF NOT EXISTS teams (
      teamId TEXT PRIMARY KEY,
      teamName TEXT NOT NULL UNIQUE,
      player1 TEXT NOT NULL,
      player2 TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      bid_coins INTEGER NOT NULL DEFAULT 1000,
      reward_points INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      teamId TEXT NOT NULL,
      sessionToken TEXT PRIMARY KEY,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      lastActive TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (teamId) REFERENCES teams(teamId) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS auctions (
      auctionId TEXT PRIMARY KEY,
      seqNo INTEGER NOT NULL,
      startBid INTEGER NOT NULL DEFAULT 50,
      increment INTEGER NOT NULL DEFAULT 10,
      duration INTEGER NOT NULL DEFAULT 60,
      status TEXT NOT NULL DEFAULT 'waiting',
      endAt INTEGER,
      winnerId TEXT,
      question TEXT,
      defaultReward INTEGER NOT NULL DEFAULT 1,
      questionId TEXT,
      finalBid INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (winnerId) REFERENCES teams(teamId)
    );

    CREATE TABLE IF NOT EXISTS bids (
      bidId TEXT PRIMARY KEY,
      auctionId TEXT NOT NULL,
      teamId TEXT NOT NULL,
      amount INTEGER NOT NULL,
      seqNo INTEGER NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (auctionId) REFERENCES auctions(auctionId),
      FOREIGN KEY (teamId) REFERENCES teams(teamId)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      taskId TEXT PRIMARY KEY,
      auctionId TEXT NOT NULL,
      teamId TEXT NOT NULL,
      finalBid INTEGER NOT NULL,
      startAt INTEGER NOT NULL,
      endAt INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      result TEXT,
      question TEXT,
      defaultReward INTEGER NOT NULL DEFAULT 1,
      questionId TEXT,
      options TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (auctionId) REFERENCES auctions(auctionId),
      FOREIGN KEY (teamId) REFERENCES teams(teamId)
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      question_text TEXT NOT NULL,
      options TEXT,
      difficulty TEXT NOT NULL DEFAULT 'medium',
      reward_points INTEGER NOT NULL DEFAULT 0,
      is_used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_results (
      resultId TEXT PRIMARY KEY,
      taskId TEXT NOT NULL,
      result TEXT NOT NULL,
      rewardPoints INTEGER NOT NULL DEFAULT 0,
      coinsDeducted INTEGER NOT NULL DEFAULT 0,
      prevReward INTEGER NOT NULL,
      prevCoins INTEGER NOT NULL,
      decidedAt INTEGER NOT NULL,
      undone INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (taskId) REFERENCES tasks(taskId) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(sessionToken);
    CREATE INDEX IF NOT EXISTS idx_sessions_team ON sessions(teamId);
    CREATE INDEX IF NOT EXISTS idx_bids_auction ON bids(auctionId);
    CREATE INDEX IF NOT EXISTS idx_bids_team ON bids(teamId);
    CREATE INDEX IF NOT EXISTS idx_bids_seq ON bids(auctionId, seqNo);
    CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_task_results_task ON task_results(taskId);
    CREATE INDEX IF NOT EXISTS idx_questions_pool ON questions(difficulty, is_used);
  `);
}

/**
 * One-way migration: databases created before the undo re-verdict fix
 * carry UNIQUE(taskId) on task_results, which permanently blocks
 * re-submission after undo. Rebuilds the table without it, preserving rows.
 */
function migrateTaskResults(db: SqlJsDatabase) {
  try {
    const out = db.exec(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'task_results'`
    );
    const ddl = (out[0]?.values[0]?.[0] as string) || "";
    if (!ddl || !/taskId TEXT NOT NULL UNIQUE/i.test(ddl)) return;

    db.run(`ALTER TABLE task_results RENAME TO task_results_legacy`);
    db.run(`
      CREATE TABLE task_results (
        resultId TEXT PRIMARY KEY,
        taskId TEXT NOT NULL,
        result TEXT NOT NULL,
        rewardPoints INTEGER NOT NULL DEFAULT 0,
        coinsDeducted INTEGER NOT NULL DEFAULT 0,
        prevReward INTEGER NOT NULL,
        prevCoins INTEGER NOT NULL,
        decidedAt INTEGER NOT NULL,
        undone INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (taskId) REFERENCES tasks(taskId) ON DELETE CASCADE
      )
    `);
    db.run(`
      INSERT INTO task_results
        (resultId, taskId, result, rewardPoints, coinsDeducted, prevReward, prevCoins, decidedAt, undone)
      SELECT resultId, taskId, result, rewardPoints, coinsDeducted, prevReward, prevCoins, decidedAt, undone
      FROM task_results_legacy
    `);
    db.run(`DROP TABLE task_results_legacy`);
    persistDb();
    console.warn("[DB] Migrated task_results: removed UNIQUE(taskId) so verdicts can be re-submitted after undo.");
  } catch (err) {
    console.error("[DB] task_results migration failed (undo re-verdict stays blocked):", err);
  }
}

/**
 * Adds a column only if missing (SQLite has no ADD COLUMN IF NOT EXISTS).
 * Existing rows get NULL (nullable) or the DEFAULT.
 */
function ensureColumn(db: SqlJsDatabase, table: string, column: string, ddl: string) {
  try {
    const out = db.exec(`PRAGMA table_info(${table})`);
    const names = (out[0]?.values ?? []).map((r) => r[1] as string);
    if (!names.includes(column)) {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
      persistDb();
      console.warn(`[DB] Migrated ${table}: added column ${column}.`);
    }
  } catch (err) {
    console.error(`[DB] ensureColumn ${table}.${column} failed:`, err);
  }
}

export function closeDb() {
  if (saveInterval) {
    clearInterval(saveInterval);
    saveInterval = null;
  }
  if (db) {
    persistDb();
    db.close();
    db = null;
  }
}
