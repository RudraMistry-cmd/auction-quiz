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
  time_limit?: number;
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

// ---- Phase / Task / State Model ----
export type GamePhase = "idle" | "bidding" | "main_task" | "ended";

export interface QuestionManifestItem {
  id: string;
  image: string;
  reward: number;
  time: number; // in seconds
  used?: boolean;
}

export interface TimestampTimer {
  startTime: number;
  duration: number; // in seconds
  remaining: number; // in seconds
  isRunning: boolean;
  label?: string;
}

export interface ManualTimerState {
  duration: number;
  endAt: number | null;
  isRunning: boolean;
  timeLeft: number;
}

export interface GameState {
  phase: GamePhase;
  currentQuestion: QuestionManifestItem | null;
  currentBid: number;
  winningTeam: { teamId: string; teamName: string } | null;
  biddingTimer: TimestampTimer | null;
  mainTaskTimer: TimestampTimer | null;
  explicitTimer: TimestampTimer | null;
  sideTaskTimer?: TimestampTimer | null; // optional backwards-compatible alias
}

export interface Task {
  taskId: string;
  auctionId: string;
  teamId: string;
  teamName?: string;
  finalBid: number;
  startAt: number; // ms timestamp
  endAt: number; // ms timestamp
  status: "active" | "ended" | "completed";
  result?: "pass" | "fail" | null;
  question?: string | null;
  defaultReward?: number;
  questionId?: string | null;
  options?: unknown[] | Record<string, unknown> | null;
  paused?: boolean;
  /** Mutation stamp (server ms clock). Higher = newer. Clock-based so it survives restarts. */
  version?: number;
  time_limit?: number;
  template_html?: string;
  rendered_html?: string;
  created_at: string;
}

export type TaskResultDecision = "pass" | "fail";

export interface TaskResultEvent {
  taskId: string;
  result: TaskResultDecision;
  teamId: string;
  teamName: string;
  coins: number; // team's bid_coins after applying the result
  rewardPoints: number; // team's reward_points after applying the result
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
  file_path: string;        // relative path to .txt file (resolved from docs/)
  reward_points: number;
  time_limit: number;        // seconds (> 0)
  template_html?: string;
  rendered_html?: string;
  is_used?: boolean;
}

export interface RenderedQuestion {
  rendered_html: string;
  reward_points: number;
  time_limit: number;
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
  "client:get_game_state": (cb: (res: { success: boolean; gameState?: GameState; error?: string }) => void) => void;
  "admin:submit_result": (
    data: { taskId: string; result: TaskResultDecision; rewardPoints?: number },
    cb: (res: ResultResponse) => void
  ) => void;
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
  "admin:preview_question": (
    data: { questionId: string },
    cb: (res: { success: boolean; rendered_html?: string; reward_points?: number; time_limit?: number; error?: string }) => void
  ) => void;
  "admin:auth": (
    data: { secret: string },
    cb: (res: { success: boolean; error?: string }) => void
  ) => void;
  "admin:update_team": (
    data: { teamId: string; bid_coins?: number; reward_points?: number },
    cb: (res: { success: boolean; team?: Team; error?: string }) => void
  ) => void;
  // Manual timer control
  "admin:timer_set_duration": (
    data: { duration: number },
    cb: (res: { success: boolean; duration?: number; endAt?: number | null; isRunning?: boolean; timeLeft?: number; error?: string }) => void
  ) => void;
  "admin:timer_start": (
    data: { duration?: number } | Record<string, never>,
    cb: (res: { success: boolean; duration?: number; endAt?: number | null; isRunning?: boolean; timeLeft?: number; error?: string }) => void
  ) => void;
  "admin:timer_pause": (
    data: Record<string, never>,
    cb: (res: { success: boolean; duration?: number; endAt?: number | null; isRunning?: boolean; timeLeft?: number; error?: string }) => void
  ) => void;
  "admin:timer_reset": (
    data: Record<string, never>,
    cb: (res: { success: boolean; duration?: number; endAt?: number | null; isRunning?: boolean; timeLeft?: number; error?: string }) => void
  ) => void;
  "admin:timer_adjust": (
    data: { seconds: number },
    cb: (res: { success: boolean; duration?: number; endAt?: number | null; isRunning?: boolean; timeLeft?: number; error?: string }) => void
  ) => void;
  // Phase & Transition controls
  "admin:start_auction": (
    data: Record<string, never>,
    cb: (res: { success: boolean; error?: string }) => void
  ) => void;
  "admin:select_question": (
    data: { questionId: string },
    cb: (res: { success: boolean; question?: QuestionManifestItem; error?: string }) => void
  ) => void;
  "admin:get_manifest": (
    data: Record<string, never>,
    cb: (res: { success: boolean; questions: QuestionManifestItem[]; currentQuestion: QuestionManifestItem | null; error?: string }) => void
  ) => void;
  "admin:pass_task": (
    data: Record<string, never>,
    cb: (res: { success: boolean; error?: string }) => void
  ) => void;
  "admin:fail_task": (
    data: Record<string, never>,
    cb: (res: { success: boolean; error?: string }) => void
  ) => void;
  "admin:end_failed_task": (
    data: Record<string, never>,
    cb: (res: { success: boolean; error?: string }) => void
  ) => void;
  "admin:assign_fallback": (
    data: { teamId: string },
    cb: (res: { success: boolean; error?: string }) => void
  ) => void;
  "admin:side_timer_start": (
    data: { duration?: number },
    cb: (res: { success: boolean; error?: string }) => void
  ) => void;
  "admin:side_timer_pause": (
    data: Record<string, never>,
    cb: (res: { success: boolean; error?: string }) => void
  ) => void;
  "admin:side_timer_adjust": (
    data: { seconds: number },
    cb: (res: { success: boolean; error?: string }) => void
  ) => void;
  "admin:explicit_timer_start": (
    data: { duration?: number },
    cb: (res: { success: boolean; error?: string }) => void
  ) => void;
  "admin:explicit_timer_pause": (
    data: Record<string, never>,
    cb: (res: { success: boolean; error?: string }) => void
  ) => void;
  "admin:explicit_timer_adjust": (
    data: { seconds: number },
    cb: (res: { success: boolean; error?: string }) => void
  ) => void;
  "admin:explicit_timer_stop": (
    data: Record<string, never>,
    cb: (res: { success: boolean; error?: string }) => void
  ) => void;
  "admin:end_round": (
    data: Record<string, never>,
    cb: (res: { success: boolean; error?: string }) => void
  ) => void;
}

// ---- Socket Events: Server -> Client ----
export interface ServerEvents {
  "phase:changed": (data: GameState) => void;
  "timer:main:start": (data: { startTime: number; duration: number; remaining: number }) => void;
  "timer:side:start": (data: { startTime: number; duration: number; remaining: number }) => void;
  "timer:explicit:start": (data: { startTime: number; duration: number; remaining: number }) => void;
  "auction:started": (auction: Auction) => void;
  "auction:bid_update": (data: { auctionId: string; bid: Bid; teamName: string; increment?: number }) => void;
  "auction:timer": (data: { auctionId: string; remaining: number }) => void;
  "auction:ended": (data: { auctionId?: string; winner: { teamId: string; teamName: string } | null; winningBid: number | null }) => void;
  "auction:cleared": () => void;
  "task:assigned": (task: Task) => void;
  "task:started": (data: { time_limit: number; endAt?: number; taskId?: string; teamName?: string; reward?: number; questionImage?: string }) => void;
  "task:timer": (data: { taskId: string; timeLeft: number; version: number }) => void;
  "task:ended": (data: { taskId: string }) => void;
  "task:result": (data: TaskResultEvent) => void;
  "scoreboard:updated": (data: { teams: ScoreboardResponse["teams"] }) => void;
  "task:paused": (data: { taskId: string; timeLeft: number; version: number }) => void;
  "task:resumed": (data: { taskId: string; timeLeft: number; version: number }) => void;
  "question:active": (data: QuestionPayload) => void;
  "question:selected": (data: QuestionPayload) => void;
  "question:preview": (data: RenderedQuestion & { questionId?: string }) => void;
  "question:image_set": (data: { imagePath: string; question?: QuestionManifestItem }) => void;
  "manual_timer:update": (data: ManualTimerState) => void;
  "timer:update": (data: {
    biddingTimer?: TimestampTimer | null;
    mainTaskTimer?: TimestampTimer | null;
    explicitTimer?: TimestampTimer | null;
    sideTaskTimer?: TimestampTimer | null;
    duration?: number;
    endAt?: number | null;
    isRunning?: boolean;
    timeLeft?: number;
  }) => void;
  "theme:changed": (data: { theme: string }) => void;
  "sound:auction_started": () => void;
  "sound:auction_ended": () => void;
  "sound:bid_updated": (data: { teamName: string; bidAmount: number; increment: number }) => void;
  "sound:bid_won": (data: { teamName: string; bidAmount: number }) => void;
  "sound:timer_started": () => void;
  "sound:timer_stopped": () => void;
  "sound:task_result": (data: { result: "pass" | "fail" }) => void;
  "sound:settings": (data: { enabled: boolean; volume: number }) => void;
  "sound:per_setting": (data: { soundName: string; enabled: boolean }) => void;
}

// A question made visible to everyone: selected (upcoming), active
// (this auction), or attached to a task. taskId present only once assigned.
export interface QuestionPayload {
  taskId?: string;
  questionId: string;
  question_text: string;
  options: unknown[] | Record<string, unknown> | null;
  file_path: string;
  reward_points: number;
  time_limit: number;
  template_html?: string;
  rendered_html?: string;
  is_used?: boolean;
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
