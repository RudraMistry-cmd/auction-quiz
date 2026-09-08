/**
 * Minimal question service — stub only.
 *
 * The Excel-based question bank has been removed.
 * Questions are now image-based: admin picks an image from /questions/,
 * it is displayed on the projector, and used images are tracked in
 * phase.service.ts.
 *
 * This stub keeps the import graph intact so auction.service.ts,
 * task.service.ts, and socket.handler.ts continue to compile.
 * Every method is a safe no-op or returns empty data.
 */

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

export class QuestionService {
  async init(): Promise<void> {}

  async getPools(): Promise<{ easy: any[]; medium: any[]; hard: any[]; selected: null }> {
    return { easy: [], medium: [], hard: [], selected: null };
  }

  async getQuestion(_id: string): Promise<null> {
    return null;
  }

  getSelectedId(): string | null {
    return null;
  }

  async getSelected(): Promise<null> {
    return null;
  }

  renderQuestion(_q: any): { rendered_html: string; reward_points: number; time_limit: number } {
    return { rendered_html: "", reward_points: 0, time_limit: 300 };
  }

  async renderQuestionById(_id: string): Promise<null> {
    return null;
  }

  toPayload(_q: any, taskId?: string): QuestionPayload {
    const payload: QuestionPayload = {
      questionId: "",
      question_text: "",
      options: null,
      file_path: "",
      reward_points: 0,
      time_limit: 300,
    };
    if (taskId) payload.taskId = taskId;
    return payload;
  }

  async markQuestionUsed(_questionId: string): Promise<boolean> {
    return true;
  }

  async selectQuestion(_questionId: string): Promise<any> {
    throw new Error("Question selection is no longer supported. Use image selection instead.");
  }

  async takeSelection(): Promise<null> {
    return null;
  }
}

export const questionService = new QuestionService();
