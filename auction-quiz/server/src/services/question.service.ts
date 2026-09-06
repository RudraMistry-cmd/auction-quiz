import { v4 as uuidv4 } from "uuid";
import * as XLSX from "xlsx";
import { getDb, persistDb } from "../db/database";
import { stateManager } from "./phase.service";
import type { Difficulty, Question, QuestionImportResult, QuestionPayload, QuestionPools } from "../types";

const MAX_ROWS = 2000;
const MAX_TEXT_LEN = 2000;
const SELECTION_KEY = "currentQuestionId";
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

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

function run(db: any, sql: string, params: any[] = []): void {
  db.run(sql, params);
}

function parseOptions(raw: unknown): { ok: true; value: Question["options"] } | { ok: false } {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return { ok: true, value: null };
  }
  try {
    const parsed: unknown = JSON.parse(String(raw));
    if (parsed === null || typeof parsed !== "object") return { ok: false };
    return { ok: true, value: parsed as Question["options"] };
  } catch {
    return { ok: false };
  }
}

function rowToQuestion(row: any): Question {
  let options: Question["options"] = null;
  if (row.options !== null && row.options !== undefined && String(row.options).trim() !== "") {
    try {
      options = JSON.parse(String(row.options));
    } catch {
      options = null;
    }
  }
  return {
    id: row.id as string,
    question_text: row.question_text as string,
    options,
    difficulty: row.difficulty as Difficulty,
    reward_points: row.reward_points as number,
  };
}

export class QuestionService {
  private selectedId: string | null = null;
  private lock: Promise<void> = Promise.resolve();

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.lock;
    this.lock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /** Load persisted selection (survives restarts; boot is always idle-safe). */
  async init(): Promise<void> {
    const db = await getDb();
    const row = queryOne(db, `SELECT value FROM settings WHERE key = ?`, [SELECTION_KEY]);
    if (row) {
      const q = queryOne(db, `SELECT id FROM questions WHERE id = ?`, [row.value]);
      this.selectedId = q ? (row.value as string) : null;
      if (!q) {
        run(db, `DELETE FROM settings WHERE key = ?`, [SELECTION_KEY]);
        persistDb();
      }
    }
  }

  private async persistSelection(db: any, id: string | null): Promise<void> {
    this.selectedId = id;
    if (id === null) {
      run(db, `DELETE FROM settings WHERE key = ?`, [SELECTION_KEY]);
    } else {
      run(db, `INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [SELECTION_KEY, id]);
    }
    persistDb();
  }

  /**
   * Import questions from an .xlsx buffer.
   * append (default): add valid rows. overwrite: clear the bank first
   * (allowed only while idle — never mid-auction/task). Invalid rows are
   * skipped individually with per-row reasons; valid rows still import.
   */
  async importExcel(buffer: Buffer, mode: "append" | "overwrite" = "append"): Promise<QuestionImportResult> {
    return this.withLock(async () => {
      if (mode !== "append" && mode !== "overwrite") {
        return { success: false, mode: "append", imported: 0, skipped: 0, errors: [], error: "mode must be 'append' or 'overwrite'" };
      }
      if (mode === "overwrite" && stateManager.getPhase() !== "idle") {
        return { success: false, mode, imported: 0, skipped: 0, errors: [], error: "Overwrite only allowed while idle" };
      }

      let workbook: XLSX.WorkBook;
      try {
        workbook = XLSX.read(buffer, { type: "buffer" });
      } catch {
        return { success: false, mode, imported: 0, skipped: 0, errors: [], error: "Invalid .xlsx file" };
      }
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        return { success: false, mode, imported: 0, skipped: 0, errors: [], error: "Workbook has no sheets" };
      }
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
        defval: "",
        raw: true,
      });
      if (rawRows.length > MAX_ROWS) {
        return { success: false, mode, imported: 0, skipped: 0, errors: [], error: `Too many rows (max ${MAX_ROWS})` };
      }

      // Normalized header check on the first data row's keys.
      const normKey = (k: string) => k.trim().toLowerCase().replace(/\s+/g, "_");
      const headers = new Set(Object.keys(rawRows[0] ?? {}).map(normKey));
      for (const required of ["question_text", "difficulty", "reward_points"]) {
        if (!headers.has(required)) {
          return { success: false, mode, imported: 0, skipped: 0, errors: [], error: `Missing required column: ${required}` };
        }
      }

      const db = await getDb();
      if (mode === "overwrite") {
        // No FK on questionId columns by design, so history rows keep
        // their denormalized copies and clearing never violates constraints.
        run(db, `DELETE FROM questions`);
        if (this.selectedId) {
          await this.persistSelection(db, null);
        }
      }

      let imported = 0;
      const errors: { row: number; reason: string }[] = [];

      rawRows.forEach((raw, i) => {
        const excelRow = i + 2; // header = row 1
        const row: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(raw)) row[normKey(k)] = v;

        const text = String(row.question_text ?? "").trim();
        if (!text) {
          errors.push({ row: excelRow, reason: "question_text is empty" });
          return;
        }
        if (text.length > MAX_TEXT_LEN) {
          errors.push({ row: excelRow, reason: `question_text exceeds ${MAX_TEXT_LEN} chars` });
          return;
        }
        const difficulty = String(row.difficulty ?? "").trim().toLowerCase();
        if (!(DIFFICULTIES as string[]).includes(difficulty)) {
          errors.push({ row: excelRow, reason: `difficulty must be one of: ${DIFFICULTIES.join(", ")}` });
          return;
        }
        if (String(row.reward_points ?? "").trim() === "") {
          errors.push({ row: excelRow, reason: "reward_points is empty" });
          return;
        }
        const rewardNum = Number(row.reward_points);
        if (!Number.isInteger(rewardNum) || rewardNum < 0) {
          errors.push({ row: excelRow, reason: "reward_points must be an integer >= 0" });
          return;
        }
        const parsed = parseOptions(row.options);
        if (!parsed.ok) {
          errors.push({ row: excelRow, reason: "options must be valid JSON or empty" });
          return;
        }

        run(db, `
          INSERT INTO questions (id, question_text, options, difficulty, reward_points, is_used)
          VALUES (?, ?, ?, ?, ?, 0)
        `, [
          uuidv4(),
          text,
          parsed.value === null ? null : JSON.stringify(parsed.value),
          difficulty,
          rewardNum,
        ]);
        imported++;
      });
      persistDb();

      return { success: true, mode, imported, skipped: errors.length, errors };
    });
  }

  /** Unused-question pools grouped by difficulty, plus current selection. */
  async getPools(): Promise<QuestionPools> {
    const db = await getDb();
    const rows = queryAll(db, `
      SELECT * FROM questions WHERE is_used = 0 ORDER BY created_at ASC
    `);
    const pools: QuestionPools = {
      easy: [],
      medium: [],
      hard: [],
      selected: this.selectedId ? await this.getQuestion(this.selectedId) : null,
    };
    for (const row of rows) {
      const q = rowToQuestion(row);
      pools[q.difficulty].push(q);
    }
    return pools;
  }

  async getQuestion(id: string): Promise<Question | null> {
    const db = await getDb();
    const row = queryOne(db, `SELECT * FROM questions WHERE id = ?`, [id]);
    return row ? rowToQuestion(row) : null;
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  /**
   * Read-only peek at the current selection, for snapshots only.
   * Auction start MUST use takeSelection() — never read-then-consume.
   */
  async getSelected(): Promise<Question | null> {
    if (!this.selectedId) return null;
    return this.getQuestion(this.selectedId);
  }

  /** Public broadcast/snapshot shape for a bank question. */
  toPayload(q: Question, taskId?: string): QuestionPayload {
    const payload: QuestionPayload = {
      questionId: q.id,
      question_text: q.question_text,
      options: q.options,
      reward_points: q.reward_points,
    };
    if (taskId) payload.taskId = taskId;
    return payload;
  }

  /**
   * Atomically take the current selection for an auction start: reads,
   * clears (memory + persisted), and returns it under the question lock.
   * A reselect racing the start either lands fully before (take returns
   * the new pick) or fails its phase check after beginAuction —
   * never a split-brain attach. Returns null when nothing is selected.
   */
  async takeSelection(): Promise<Question | null> {
    return this.withLock(async () => {
      if (!this.selectedId) return null;
      const db = await getDb();
      const row = queryOne(db, `SELECT * FROM questions WHERE id = ?`, [this.selectedId]);
      await this.persistSelection(db, null);
      return row ? rowToQuestion(row) : null;
    });
  }

  /**
   * Select a question for the next auction. Only while idle (never
   * mid-auction/task), and only unused questions. Marks it used
   * immediately; each auction consumes one selection.
   */
  async selectQuestion(questionId: string): Promise<Question> {
    return this.withLock(async () => {
      if (stateManager.getPhase() !== "idle") {
        throw new Error("Select questions only while idle (no auction or task running)");
      }
      const db = await getDb();
      const row = queryOne(db, `SELECT * FROM questions WHERE id = ?`, [questionId]);
      if (!row) throw new Error("Question not found");
      if ((row.is_used as number) !== 0) throw new Error("Question already used");
      run(db, `UPDATE questions SET is_used = 1 WHERE id = ?`, [questionId]);
      await this.persistSelection(db, questionId);
      return rowToQuestion({ ...row, is_used: 1 });
    });
  }

}

export const questionService = new QuestionService();
