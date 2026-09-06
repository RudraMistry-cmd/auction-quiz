import { getDb, closeDb } from "./database";

async function reset() {
  const db = await getDb();
  console.log("[DB Reset] Clearing all data...");

  db.run("DELETE FROM task_results");
  db.run("DELETE FROM tasks");
  db.run("DELETE FROM bids");
  db.run("DELETE FROM auctions");
  db.run("DELETE FROM sessions");
  db.run("DELETE FROM teams");

  console.log("[DB Reset] Done.");
  closeDb();
  process.exit(0);
}

reset();
