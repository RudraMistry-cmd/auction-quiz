import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { getDb, persistDb } from "../db/database";

export interface PoolTeam {
  id: number;
  name: string;
  is_assigned: boolean;
}

export interface PoolStats {
  total: number;
  assigned: number;
  remaining: number;
  pool: PoolTeam[];
}

function queryAll(db: any, sql: string, params: any[] = []): any[] {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(db: any, sql: string, params: any[] = []): any | undefined {
  return queryAll(db, sql, params)[0] || undefined;
}

function run(db: any, sql: string, params: any[] = []): { changes: number } {
  db.run(sql, params);
  return { changes: db.getRowsModified() };
}

export class TeamPoolService {
  private initialized: boolean = false;

  /**
   * Reads Excel (or CSV fallback) on server boot and populates `team_pool` table.
   * Reconciles assignment status with existing teams in DB.
   */
  async init(): Promise<void> {
    const db = await getDb();

    const excelPath = path.join(__dirname, "..", "..", "data", "team_pool.xlsx");
    const csvPath = path.join(__dirname, "..", "..", "data", "team_pool.csv");

    let entries: { id: number; name: string }[] = [];

    if (fs.existsSync(excelPath)) {
      try {
        const wb = XLSX.readFile(excelPath);
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const parsed = XLSX.utils.sheet_to_json<any>(sheet);
        entries = parsed.map((row: any, idx: number) => ({
          id: parseInt(row.id ?? row.ID ?? idx + 1, 10),
          name: String(row.name ?? row.Name ?? "").trim(),
        })).filter((e) => e.name.length > 0);
      } catch (err) {
        console.error("[TeamPool] Failed to read team_pool.xlsx:", err);
      }
    }

    if (entries.length === 0 && fs.existsSync(csvPath)) {
      try {
        const content = fs.readFileSync(csvPath, "utf8");
        const lines = content.split(/\r?\n/).filter(Boolean);
        // Skip header if present
        const start = lines[0].toLowerCase().includes("name") ? 1 : 0;
        for (let i = start; i < lines.length; i++) {
          const parts = lines[i].split(",");
          if (parts.length >= 2) {
            const id = parseInt(parts[0].trim(), 10) || i + 1;
            const name = parts.slice(1).join(",").trim();
            if (name) entries.push({ id, name });
          }
        }
      } catch (err) {
        console.error("[TeamPool] Failed to read team_pool.csv fallback:", err);
      }
    }

    // Default fallback if no file present
    if (entries.length === 0) {
      const defaultNames = [
        "#include", "#define", "stdio.h", "math.h", "main()",
        "printf()", "scanf()", "malloc()", "free()", "return 0;",
        "typedef", "struct", "sizeof()", "pointer*", "while(1)",
        "break;", "const", "switch()", "case:", "void*",
      ];
      entries = defaultNames.map((name, i) => ({ id: i + 1, name }));
    }

    // Insert or update entries in database
    for (const entry of entries) {
      const existing = queryOne(db, "SELECT id, is_assigned FROM team_pool WHERE id = ? OR name = ?", [entry.id, entry.name]);
      if (!existing) {
        run(db, "INSERT INTO team_pool (id, name, is_assigned) VALUES (?, ?, 0)", [entry.id, entry.name]);
      }
    }

    // Reconcile assignments: any name in `teams` MUST have is_assigned = 1
    run(db, `
      UPDATE team_pool SET is_assigned = 1 
      WHERE name IN (SELECT teamName FROM teams)
    `);

    // Any name NOT in `teams` should be free if unassigned
    run(db, `
      UPDATE team_pool SET is_assigned = 0
      WHERE name NOT IN (SELECT teamName FROM teams)
    `);

    persistDb();
    this.initialized = true;

    const count = queryOne(db, "SELECT COUNT(*) as c FROM team_pool")?.c || 0;
    const assigned = queryOne(db, "SELECT COUNT(*) as c FROM team_pool WHERE is_assigned = 1")?.c || 0;
    console.log(`[TeamPool] Initialized pool: ${count} teams loaded (${assigned} assigned, ${count - assigned} available)`);
  }

  /**
   * Deterministically claims the first available team name from the pool.
   * Throws if all teams are assigned.
   */
  async claimNextTeamName(): Promise<{ id: number; name: string }> {
    const db = await getDb();
    if (!this.initialized) await this.init();

    const row = queryOne(db, `
      SELECT id, name FROM team_pool 
      WHERE is_assigned = 0 
      ORDER BY id ASC 
      LIMIT 1
    `);

    if (!row) {
      throw new Error("All teams are full");
    }

    run(db, "UPDATE team_pool SET is_assigned = 1 WHERE id = ?", [row.id]);
    persistDb();
    return { id: row.id, name: row.name };
  }

  /**
   * Releases a team name back to the pool (e.g. on team deletion).
   */
  async releaseTeamName(name: string): Promise<void> {
    const db = await getDb();
    run(db, "UPDATE team_pool SET is_assigned = 0 WHERE name = ?", [name]);
    persistDb();
  }

  /**
   * Resets pool assignments for any team names not actively registered in `teams`.
   */
  async resetPool(): Promise<PoolStats> {
    const db = await getDb();
    run(db, `
      UPDATE team_pool SET is_assigned = 0 
      WHERE name NOT IN (SELECT teamName FROM teams)
    `);
    persistDb();
    return this.getPoolStats();
  }

  /**
   * Returns current statistics and state of the team pool.
   */
  async getPoolStats(): Promise<PoolStats> {
    const db = await getDb();
    const rows = queryAll(db, "SELECT id, name, is_assigned FROM team_pool ORDER BY id ASC");
    const pool: PoolTeam[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      is_assigned: Boolean(r.is_assigned),
    }));
    const total = pool.length;
    const assigned = pool.filter((p) => p.is_assigned).length;
    return {
      total,
      assigned,
      remaining: total - assigned,
      pool,
    };
  }
}

export const teamPoolService = new TeamPoolService();
