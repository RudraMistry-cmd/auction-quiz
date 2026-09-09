import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { getDb, persistDb } from "../db/database";
import { teamPoolService } from "./team-pool.service";
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

/* ─── Validation Helpers ─── */
export interface ValidationError {
  field: string;
  message: string;
}

export function validateRegistration(data: TeamRegistration): ValidationError[] {
  const errors: ValidationError[] = [];

  // Player 1: non-empty, min length 2, letters and spaces only
  const player1 = data.player1?.trim() || "";
  if (player1.length === 0) {
    errors.push({ field: "player1", message: "Player 1 name is required" });
  } else if (player1.length < 2) {
    errors.push({ field: "player1", message: "Player 1 name must be at least 2 characters" });
  } else if (!/^[a-zA-Z ]+$/.test(player1)) {
    errors.push({ field: "player1", message: "Player name must contain only letters and spaces" });
  }

  // Player 2: non-empty, min length 2, letters and spaces only
  const player2 = data.player2?.trim() || "";
  if (player2.length === 0) {
    errors.push({ field: "player2", message: "Player 2 name is required" });
  } else if (player2.length < 2) {
    errors.push({ field: "player2", message: "Player 2 name must be at least 2 characters" });
  } else if (!/^[a-zA-Z ]+$/.test(player2)) {
    errors.push({ field: "player2", message: "Player name must contain only letters and spaces" });
  }

  // Email: valid format
  const email = data.email?.trim() || "";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (email.length === 0) {
    errors.push({ field: "email", message: "Email is required" });
  } else if (!emailRegex.test(email)) {
    errors.push({ field: "email", message: "Please enter a valid email address" });
  }

  // Phone: 10-digit numeric
  const phone = data.phone?.trim() || "";
  const phoneRegex = /^\d{10}$/;
  if (phone.length === 0) {
    errors.push({ field: "phone", message: "Phone number is required" });
  } else if (!phoneRegex.test(phone)) {
    errors.push({ field: "phone", message: "Enter a valid 10-digit phone number" });
  }

  // DeviceId: required for session lock
  const deviceId = data.deviceId?.trim() || "";
  if (deviceId.length === 0) {
    errors.push({ field: "deviceId", message: "Device identifier is required" });
  }

  return errors;
}

export function sanitizeInput(data: TeamRegistration): TeamRegistration {
  return {
    player1: (data.player1 || "").trim(),
    player2: (data.player2 || "").trim(),
    email: (data.email || "").trim().toLowerCase(),
    phone: (data.phone || "").trim(),
    deviceId: (data.deviceId || "").trim(),
  };
}

export class TeamService {
  async register(data: TeamRegistration): Promise<{ team: Team; sessionToken: string } | { error: string; errors?: ValidationError[] }> {
    const db = await getDb();

    // Sanitize input
    const sanitized = sanitizeInput(data);

    // 1. Device-Level Session Lock:
    // If deviceId already has an assigned team in device_sessions, return it immediately (idempotent, no duplicate creation)
    if (sanitized.deviceId) {
      const existingDevice = queryOne(db, "SELECT teamId FROM device_sessions WHERE deviceId = ?", [sanitized.deviceId]);
      if (existingDevice) {
        const existingTeam = await this.getTeam(existingDevice.teamId);
        if (existingTeam) {
          let session = queryOne(db, "SELECT sessionToken FROM sessions WHERE teamId = ? ORDER BY createdAt DESC LIMIT 1", [existingTeam.teamId]);
          let sessionToken = session?.sessionToken;
          if (!sessionToken) {
            sessionToken = crypto.randomBytes(48).toString("hex");
            run(db, "INSERT INTO sessions (teamId, sessionToken) VALUES (?, ?)", [existingTeam.teamId, sessionToken]);
            persistDb();
          }
          console.log(`[Team] Device ${sanitized.deviceId} already mapped to ${existingTeam.teamName}. Returning existing team.`);
          return { team: existingTeam, sessionToken };
        }
      }
    }

    // Validate input
    const validationErrors = validateRegistration(sanitized);
    if (validationErrors.length > 0) {
      return { error: validationErrors[0].message, errors: validationErrors };
    }

    // Check duplicate email
    const existingEmail = queryOne(db, "SELECT teamId FROM teams WHERE email = ?", [sanitized.email]);
    if (existingEmail) {
      return { error: "This email is already registered" };
    }

    // Check duplicate phone
    const existingPhone = queryOne(db, "SELECT teamId FROM teams WHERE phone = ?", [sanitized.phone]);
    if (existingPhone) {
      return { error: "This phone number is already registered" };
    }

    // Claim next available team name from pool
    let poolEntry: { id: number; name: string };
    try {
      poolEntry = await teamPoolService.claimNextTeamName();
    } catch (err: any) {
      return { error: err.message || "All teams are full" };
    }

    const teamId = uuidv4();
    const sessionToken = crypto.randomBytes(48).toString("hex");

    run(db, `
      INSERT INTO teams (teamId, teamName, player1, player2, phone, email, deviceId, bid_coins, reward_points)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1000, 0)
    `, [teamId, poolEntry.name, sanitized.player1, sanitized.player2, sanitized.phone, sanitized.email, sanitized.deviceId]);

    run(db, `
      INSERT OR REPLACE INTO device_sessions (deviceId, teamId)
      VALUES (?, ?)
    `, [sanitized.deviceId, teamId]);

    run(db, `
      INSERT INTO sessions (teamId, sessionToken)
      VALUES (?, ?)
    `, [teamId, sessionToken]);

    persistDb();

    const team = (await this.getTeam(teamId))!;
    return { team, sessionToken };
  }

  async getTeamByDevice(deviceId: string): Promise<{ team: Team; sessionToken: string } | null> {
    const db = await getDb();
    if (!deviceId) return null;
    const mapping = queryOne(db, "SELECT teamId FROM device_sessions WHERE deviceId = ?", [deviceId]);
    if (!mapping) return null;
    const team = await this.getTeam(mapping.teamId);
    if (!team) return null;

    let session = queryOne(db, "SELECT sessionToken FROM sessions WHERE teamId = ? ORDER BY createdAt DESC LIMIT 1", [team.teamId]);
    let sessionToken = session?.sessionToken;
    if (!sessionToken) {
      sessionToken = crypto.randomBytes(48).toString("hex");
      run(db, "INSERT INTO sessions (teamId, sessionToken) VALUES (?, ?)", [team.teamId, sessionToken]);
      persistDb();
    }
    return { team, sessionToken };
  }

  async updateTeam(teamId: string, updates: { bid_coins?: number; reward_points?: number; email?: string; phone?: string }): Promise<{ team: Team } | { error: string }> {
    const db = await getDb();

    // Check team exists
    const existing = queryOne(db, "SELECT teamId FROM teams WHERE teamId = ?", [teamId]);
    if (!existing) {
      return { error: "Team not found" };
    }

    // Validate email if provided
    if (updates.email !== undefined) {
      const email = updates.email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return { error: "Please enter a valid email address" };
      }
      // Check duplicate email (excluding this team)
      const duplicateEmail = queryOne(db, "SELECT teamId FROM teams WHERE email = ? AND teamId != ?", [email, teamId]);
      if (duplicateEmail) {
        return { error: "This email is already registered" };
      }
    }

    // Validate phone if provided
    if (updates.phone !== undefined) {
      const phone = updates.phone.trim();
      const phoneRegex = /^[6-9]\d{9}$/;
      if (!phoneRegex.test(phone)) {
        return { error: "Enter a valid 10-digit Indian number (starting with 6-9)" };
      }
      // Check duplicate phone (excluding this team)
      const duplicatePhone = queryOne(db, "SELECT teamId FROM teams WHERE phone = ? AND teamId != ?", [phone, teamId]);
      if (duplicatePhone) {
        return { error: "This phone number is already registered" };
      }
    }

    // Validate coins and points if provided
    if (updates.bid_coins !== undefined) {
      if (!Number.isInteger(updates.bid_coins) || updates.bid_coins < 0) {
        return { error: "Coins must be a non-negative integer" };
      }
    }
    if (updates.reward_points !== undefined) {
      if (!Number.isInteger(updates.reward_points) || updates.reward_points < 0) {
        return { error: "Points must be a non-negative integer" };
      }
    }

    // Build update query dynamically
    const setClauses: string[] = [];
    const params: any[] = [];

    if (updates.bid_coins !== undefined) {
      setClauses.push("bid_coins = ?");
      params.push(updates.bid_coins);
    }
    if (updates.reward_points !== undefined) {
      setClauses.push("reward_points = ?");
      params.push(updates.reward_points);
    }
    if (updates.email !== undefined) {
      setClauses.push("email = ?");
      params.push(updates.email.trim().toLowerCase());
    }
    if (updates.phone !== undefined) {
      setClauses.push("phone = ?");
      params.push(updates.phone.trim());
    }

    if (setClauses.length === 0) {
      return { error: "No fields to update" };
    }

    params.push(teamId);
    run(db, `UPDATE teams SET ${setClauses.join(", ")} WHERE teamId = ?`, params);
    persistDb();

    const team = (await this.getTeam(teamId))!;
    return { team };
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

  async deleteTeam(teamId: string): Promise<{ success: boolean; error?: string }> {
    const db = await getDb();
    const existing = await this.getTeam(teamId);
    if (!existing) {
      return { success: false, error: "Team not found" };
    }

    // Release team name back to pool
    await teamPoolService.releaseTeamName(existing.teamName);

    // Clean up dependent records safely
    run(db, "UPDATE auctions SET winnerId = NULL WHERE winnerId = ?", [teamId]);
    run(db, "DELETE FROM bids WHERE teamId = ?", [teamId]);

    const tasks = queryAll(db, "SELECT taskId FROM tasks WHERE teamId = ?", [teamId]);
    for (const t of tasks) {
      run(db, "DELETE FROM task_results WHERE taskId = ?", [t.taskId]);
    }
    run(db, "DELETE FROM tasks WHERE teamId = ?", [teamId]);
    run(db, "DELETE FROM sessions WHERE teamId = ?", [teamId]);
    run(db, "DELETE FROM device_sessions WHERE teamId = ?", [teamId]);
    run(db, "DELETE FROM teams WHERE teamId = ?", [teamId]);
    persistDb();

    return { success: true };
  }
}

export const teamService = new TeamService();
