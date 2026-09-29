export type Role = "participant" | "admin" | "present";

export type QuestionStatus = "PENDING" | "LIVE" | "ANSWERED" | "REJECTED";

export interface QuestionDTO {
  id: string;
  text: string;
  authorName: string | null;
  authorId: string;
  status: QuestionStatus;
  starred: boolean;
  votes: number;
  createdAt: string;
}

export interface EventDTO {
  id: string;
  code: string;
  name: string;
  archived: boolean;
  qaEnabled: boolean;
  qaModeration: boolean;
  qaAnonymousAllowed: boolean;
  qaPaused: boolean;
  highlightedQuestionId: string | null;
  activePollId: string | null;
}

export type PollKind = "POLL" | "QUIZ";
export type PollStatus = "DRAFT" | "ACTIVE" | "CLOSED";
export type QuizPhase = "LOBBY" | "QUESTION" | "REVEAL" | "FINISHED";
export type PollQuestionType =
  | "MULTIPLE_CHOICE"
  | "WORD_CLOUD"
  | "RATING"
  | "OPEN_TEXT"
  | "RANKING"
  | "QUIZ";

export const QUESTION_TYPE_LABELS: Record<PollQuestionType, string> = {
  MULTIPLE_CHOICE: "Multiple choice",
  WORD_CLOUD: "Word cloud",
  RATING: "Rating",
  OPEN_TEXT: "Open text",
  RANKING: "Ranking",
  QUIZ: "Quiz question",
};

export interface PollOptionDTO {
  id: string;
  text: string;
  /** Only sent to hosts, or to participants once a quiz answer is revealed. */
  isCorrect?: boolean;
}

export interface PollQuestionDTO {
  id: string;
  type: PollQuestionType;
  text: string;
  allowMultiple: boolean;
  ratingMax: number;
  timeLimitSec: number;
  options: PollOptionDTO[];
}

export interface QuizStateDTO {
  phase: QuizPhase;
  index: number;
  endsAt: string | null;
  serverNow: string;
}

export interface PollDTO {
  id: string;
  title: string;
  kind: PollKind;
  status: PollStatus;
  resultsVisible: boolean;
  votingLocked: boolean;
  presentIndex: number;
  quiz: QuizStateDTO | null;
  questions: PollQuestionDTO[];
  /** Total questions; participants may receive fewer (unrevealed quiz questions are withheld). */
  questionCount: number;
  respondents?: number;
}

/** What a participant submits for one poll question. */
export type ResponseValue =
  | { optionIds: string[] }
  | { rating: number }
  | { words: string[] }
  | { text: string }
  | { ranking: string[] };

export type QuestionResult =
  | {
      type: "choice";
      total: number;
      options: { id: string; text: string; count: number; isCorrect?: boolean }[];
    }
  | { type: "rating"; total: number; average: number; max: number; distribution: number[] }
  | { type: "words"; total: number; words: { text: string; count: number }[] }
  | { type: "text"; total: number; answers: { id: string; text: string }[] }
  | {
      type: "ranking";
      total: number;
      options: { id: string; text: string; points: number; averagePosition: number }[];
    };

export interface PollResultsDTO {
  pollId: string;
  respondents: number;
  questions: Record<string, QuestionResult>;
}

export interface LeaderboardEntry {
  participantId: string;
  name: string;
  score: number;
  rank: number;
}

export interface ActivePollPayload {
  poll: PollDTO | null;
  results: PollResultsDTO | null;
  leaderboard: LeaderboardEntry[] | null;
}

export interface QuizMeDTO {
  pollId: string;
  total: number;
  rank: number | null;
  players: number;
  lastScore: number | null;
  /** Quiz question ids this participant has answered. */
  answered: string[];
}

export interface MeDTO {
  id: string;
  token: string;
  name: string | null;
  votedQuestionIds: string[];
  answeredPollQuestionIds: string[];
}

export interface JoinResult {
  event: EventDTO;
  questions: QuestionDTO[];
  activePoll: ActivePollPayload;
  me?: MeDTO;
  polls?: PollDTO[];
}

export type Ack<T = unknown> = { ok: true; data: T } | { ok: false; error: string };
