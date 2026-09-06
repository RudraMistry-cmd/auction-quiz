import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { getDb, persistDb } from "../db/database";
import type { Team, TeamSession, TeamRegistration } from "../types";

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

export class TeamService {
  async register(data: TeamRegistration): Promise<{ team: Team; sessionToken: string } | { error: string }> {
    const db = await getDb();

    const existing = queryOne(db, "SELECT teamId FROM teams WHERE teamName = ?", [data.teamName]);
    if (existing) {
      return { error: "Team name already exists" };
    }

    const teamId = uuidv4();
    const sessionToken = crypto.randomBytes(48).toString("hex");

    run(db, `
      INSERT INTO teams (teamId, teamName, player1, player2, phone, email)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [teamId, data.teamName, data.player1, data.player2, data.phone, data.email]);

    run(db, `
      INSERT INTO sessions (teamId, sessionToken)
      VALUES (?, ?)
    `, [teamId, sessionToken]);
    persistDb();

    const team = (await this.getTeam(teamId))!;
    return { team, sessionToken };
  }

  async validateSession(sessionToken: string): Promise<Team | null> {
    const db = await getDb();
    const session = queryOne(db, `
      SELECT s.teamId FROM sessions s WHERE s.sessionToken = ?
    `, [sessionToken]);

    if (!session) return null;

    run(db, `
      UPDATE sessions SET lastActive = datetime('now') WHERE sessionToken = ?
    `, [sessionToken]);

    const team = await this.getTeam(session.teamId);
    return team;
  }

  async getTeam(teamId: string): Promise<Team | null> {
    const db = await getDb();
    const row = queryOne(db, "SELECT * FROM teams WHERE teamId = ?", [teamId]);
    return (row as Team) || null;
  }

  async deductCoins(teamId: string, amount: number): Promise<boolean> {
    const db = await getDb();
    const result = run(db, `
      UPDATE teams SET bid_coins = bid_coins - ?
      WHERE teamId = ? AND bid_coins >= ?
    `, [amount, teamId, amount]);
    return result.changes > 0;
  }

  async addRewardPoints(teamId: string, points: number): Promise<void> {
    const db = await getDb();
    run(db, `
      UPDATE teams SET reward_points = reward_points + ?
      WHERE teamId = ?
    `, [points, teamId]);
  }

  async getAllTeams(): Promise<Team[]> {
    const db = await getDb();
    return queryAll(db, "SELECT * FROM teams ORDER BY reward_points DESC, bid_coins DESC") as Team[];
  }

  async getScoreboard() {
    const db = await getDb();
    return queryAll(db, `
      SELECT 
        t.teamId,
        t.teamName,
        t.bid_coins,
        t.reward_points,
        COUNT(b.bidId) as totalBids
      FROM teams t
      LEFT JOIN bids b ON t.teamId = b.teamId
      GROUP BY t.teamId
      ORDER BY t.reward_points DESC, t.bid_coins DESC
    `);
  }
}

export const teamService = new TeamService();
