// ========================================
// Shared Types - Auction Quiz
// ========================================

// ---- Team ----
export interface TeamRegistration {
  teamName: string;
  player1: string;
  player2: string;
  phone: string;
  email: string;
}

export interface Team {
  teamId: string;
  teamName: string;
  player1: string;
  player2: string;
  phone: string;
  email: string;
  bid_coins: number;
  reward_points: number;
  created_at: string;
}

export interface TeamSession {
  teamId: string;
  sessionToken: string;
  createdAt: string;
  lastActive: string;
}

// ---- Auction ----
export interface Auction {
  auctionId: string;
  seqNo: number;
  startBid: number;
  increment: number;
  duration: number;
  status: "active" | "completed" | "waiting";
  endAt: number; // timestamp ms
  winnerId: string | null;
  question?: string | null;
  defaultReward?: number;
  questionId?: string | null;
  created_at: string;
}

export interface Bid {
  bidId: string;
  auctionId: string;
  teamId: string;
  amount: number;
  seqNo: number;
  createdAt: string;
}

export interface AuctionConfig {
  startBid: number;
  increment: number;
  duration: number; // seconds
}

// ---- Phase / Task ----
export type GamePhase = "idle" | "auction" | "task";

export interface Task {
  taskId: string;
  auctionId: string;
  teamId: string;
  teamName?: string;
  finalBid: number;
  startAt: number; // ms timestamp
  endAt: number; // ms timestamp (startAt + 300s)
  status: "active" | "ended" | "completed";
  result?: "pass" | "fail" | null;
  question?: string | null;
  defaultReward?: number;
  questionId?: string | null;
  options?: unknown[] | Record<string, unknown> | null;
  paused?: boolean;
  /** Mutation stamp (server ms clock). Higher = newer. Clock-based so it survives restarts. */
  version?: number;
  created_at: string;
}

export type TaskResultDecision = "pass" | "fail";

export interface TaskResultEvent {
  taskId: string;
  result: TaskResultDecision;
  undone: boolean;
  teamId: string;
  teamName: string;
  coins: number; // team's bid_coins after applying (or restoring) the result
  rewardPoints: number; // team's reward_points after applying (or restoring)
  rewardGranted: number; // pass only
  coinsDeducted: number; // fail only
}

// ---- Question Bank ----
export type Difficulty = "easy" | "medium" | "hard";

export interface Question {
  id: string;
  question_text: string;
  options: unknown[] | Record<string, unknown> | null; // parsed JSON, null when empty
  difficulty: Difficulty;
  reward_points: number;
}

export interface QuestionPools {
  easy: Question[];
  medium: Question[];
  hard: Question[];
  selected: Question | null;
}

export interface QuestionImportError {
  row: number; // Excel row number (header = 1)
  reason: string;
}

export interface QuestionImportResult {
  success: boolean;
  mode: "append" | "overwrite";
  imported: number;
  skipped: number;
  errors: QuestionImportError[];
  error?: string;
}

// ---- Socket Events: Client -> Server ----
export interface ClientEvents {
  "client:register": (data: TeamRegistration, cb: (res: RegisterResponse) => void) => void;
  "client:reconnect": (data: { sessionToken: string }, cb: (res: ReconnectResponse) => void) => void;
  "client:place_bid": (data: { teamId: string; auctionId: string }, cb: (res: BidResponse) => void) => void;
  "client:get_scoreboard": (cb: (res: ScoreboardResponse) => void) => void;
  "admin:submit_result": (
    data: { taskId: string; result: TaskResultDecision; rewardPoints?: number },
    cb: (res: ResultResponse) => void
  ) => void;
  "admin:undo": (data: { taskId?: string }, cb: (res: UndoResponse) => void) => void;
  "admin:task_pause": (data: { taskId: string }, cb: (res: TaskTimerResponse) => void) => void;
  "admin:task_resume": (data: { taskId: string }, cb: (res: TaskTimerResponse) => void) => void;
  "admin:task_adjust": (
    data: { taskId: string; seconds: number },
    cb: (res: TaskTimerResponse) => void
  ) => void;
  "admin:task_start": (data: { taskId: string }, cb: (res: TaskTimerResponse) => void) => void;
  "admin:get_questions": (cb: (res: QuestionPools) => void) => void;
  "admin:select_question": (
    data: { questionId: string },
    cb: (res: { success: boolean; question?: Question; error?: string }) => void
  ) => void;
}

// ---- Socket Events: Server -> Client ----
export interface ServerEvents {
  "auction:started": (auction: Auction) => void;
  "auction:bid_update": (data: { auctionId: string; bid: Bid; teamName: string }) => void;
  "auction:timer": (data: { auctionId: string; remaining: number }) => void;
  "auction:ended": (data: { auctionId: string; winner: Team | null; winningBid: number | null }) => void;
  "auction:cleared": () => void;
  "task:assigned": (task: Task) => void;
  "task:timer": (data: { taskId: string; timeLeft: number; version: number }) => void;
  "task:ended": (data: { taskId: string }) => void;
  "task:result": (data: TaskResultEvent) => void;
  "scoreboard:updated": (data: { teams: ScoreboardResponse["teams"] }) => void;
  "task:paused": (data: { taskId: string; timeLeft: number; version: number }) => void;
  "task:resumed": (data: { taskId: string; timeLeft: number; version: number }) => void;
  "question:active": (data: QuestionPayload) => void;
  "question:selected": (data: QuestionPayload) => void;
}

// A question made visible to everyone: selected (upcoming), active
// (this auction), or attached to a task. taskId present only once assigned.
export interface QuestionPayload {
  taskId?: string;
  questionId: string;
  question_text: string;
  options: unknown[] | Record<string, unknown> | null;
  reward_points: number;
}

// ---- Response Types ----
export interface RegisterResponse {
  success: boolean;
  team?: Team;
  sessionToken?: string;
  error?: string;
}

export interface ReconnectResponse {
  success: boolean;
  team?: Team;
  currentAuction?: Auction;
  currentBid?: number;
  timer?: number; // seconds remaining
  recentBids?: Bid[];
  phase?: GamePhase;
  activeTask?: (Task & { timeLeft: number }) | null;
  taskTimer?: number; // seconds remaining on the active task
  activeQuestion?: QuestionPayload | null;
  upcomingQuestion?: QuestionPayload | null;
  error?: string;
}

export interface ResultResponse {
  success: boolean;
  task?: Task;
  team?: Team;
  error?: string;
}

export interface UndoResponse {
  success: boolean;
  taskId?: string;
  team?: Team;
  error?: string;
}

export interface TaskTimerResponse {
  success: boolean;
  taskId?: string;
  timeLeft?: number;
  paused?: boolean;
  revived?: boolean;
  error?: string;
}

export interface BidResponse {
  success: boolean;
  bid?: Bid;
  remainingCoins?: number;
  error?: string;
}

export interface ScoreboardResponse {
  teams: Array<{
    teamId: string;
    teamName: string;
    bid_coins: number;
    reward_points: number;
    totalBids: number;
  }>;
}
