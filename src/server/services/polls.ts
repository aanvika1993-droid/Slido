import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { aggregateQuestion, buildLeaderboard } from "@/lib/results";
import { quizScore } from "@/lib/scoring";
import type {
  ActivePollPayload,
  LeaderboardEntry,
  PollDTO,
  PollKind,
  PollQuestionType,
  PollResultsDTO,
  PollStatus,
  QuizMeDTO,
  QuizPhase,
  ResponseValue,
} from "@/lib/types";
import { prisma } from "../db";
import { UserError, zodMessage } from "../errors";

export const pollInclude = {
  questions: {
    orderBy: { order: "asc" },
    include: { options: { orderBy: { order: "asc" } } },
  },
} satisfies Prisma.PollInclude;

export type PollWithQuestions = Prisma.PollGetPayload<{ include: typeof pollInclude }>;
type PollQuestionWithOptions = PollWithQuestions["questions"][number];

const QUESTION_TYPES = [
  "MULTIPLE_CHOICE",
  "WORD_CLOUD",
  "RATING",
  "OPEN_TEXT",
  "RANKING",
  "QUIZ",
] as const satisfies readonly PollQuestionType[];

const OPTION_TYPES: PollQuestionType[] = ["MULTIPLE_CHOICE", "RANKING", "QUIZ"];
const QUIZ_GRACE_MS = 1000;

// ---------- DTOs ----------

/** `visibleQuestions` hides quiz questions that have not been reached yet. */
export function toPollDTO(
  poll: PollWithQuestions,
  opts: { revealAnswersUpTo: number; visibleQuestions?: number; respondents?: number },
): PollDTO {
  const questions = poll.questions.slice(0, opts.visibleQuestions ?? poll.questions.length);
  return {
    id: poll.id,
    title: poll.title,
    kind: poll.kind as PollKind,
    status: poll.status as PollStatus,
    resultsVisible: poll.resultsVisible,
    votingLocked: poll.votingLocked,
    presentIndex: poll.presentIndex,
    quiz:
      poll.kind === "QUIZ"
        ? {
            phase: poll.quizPhase as QuizPhase,
            index: poll.quizIndex,
            endsAt: poll.quizEndsAt?.toISOString() ?? null,
            serverNow: new Date().toISOString(),
          }
        : null,
    questions: questions.map((q, i) => ({
      id: q.id,
      type: q.type as PollQuestionType,
      text: q.text,
      allowMultiple: q.allowMultiple,
      ratingMax: q.ratingMax,
      timeLimitSec: q.timeLimitSec,
      options: q.options.map((o) => ({
        id: o.id,
        text: o.text,
        ...(i <= opts.revealAnswersUpTo ? { isCorrect: o.isCorrect } : {}),
      })),
    })),
    questionCount: poll.questions.length,
    ...(opts.respondents !== undefined ? { respondents: opts.respondents } : {}),
  };
}

export async function getPoll(eventId: string, pollId: unknown): Promise<PollWithQuestions> {
  if (typeof pollId !== "string") throw new UserError("Poll not found");
  const poll = await prisma.poll.findUnique({ where: { id: pollId }, include: pollInclude });
  if (!poll || poll.eventId !== eventId) throw new UserError("Poll not found");
  return poll;
}

export async function listPolls(eventId: string): Promise<PollDTO[]> {
  const [polls, responses] = await Promise.all([
    prisma.poll.findMany({
      where: { eventId },
      include: pollInclude,
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    prisma.pollResponse.findMany({
      where: { pollQuestion: { poll: { eventId } } },
      select: { participantId: true, pollQuestion: { select: { pollId: true } } },
    }),
  ]);
  const respondents = new Map<string, Set<string>>();
  for (const r of responses) {
    const set = respondents.get(r.pollQuestion.pollId) ?? new Set<string>();
    set.add(r.participantId);
    respondents.set(r.pollQuestion.pollId, set);
  }
  return polls.map((p) =>
    toPollDTO(p, { revealAnswersUpTo: Infinity, respondents: respondents.get(p.id)?.size ?? 0 }),
  );
}

// ---------- Create / edit ----------

const optionSchema = z.object({
  text: z.string().trim().min(1, "Options can't be empty").max(200),
  isCorrect: z.boolean().optional(),
});

const questionSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  text: z.string().trim().min(1, "Every question needs some text").max(300),
  allowMultiple: z.boolean().optional(),
  ratingMax: z.number().int().min(3).max(10).optional(),
  timeLimitSec: z.number().int().min(5).max(120).optional(),
  options: z.array(optionSchema).max(12, "Use at most 12 options").optional(),
});

const pollSchema = z
  .object({
    title: z.string().trim().max(200).optional(),
    kind: z.enum(["POLL", "QUIZ"]),
    questions: z.array(questionSchema).min(1, "Add at least one question").max(30),
  })
  .superRefine((poll, ctx) => {
    poll.questions.forEach((q, i) => {
      const where = poll.questions.length > 1 ? ` (question ${i + 1})` : "";
      if ((poll.kind === "QUIZ") !== (q.type === "QUIZ")) {
        ctx.addIssue({ code: "custom", message: `Quizzes may only contain quiz questions${where}` });
      }
      if (OPTION_TYPES.includes(q.type) && (q.options?.length ?? 0) < 2) {
        ctx.addIssue({ code: "custom", message: `Add at least two options${where}` });
      }
      if (q.type === "QUIZ" && !q.options?.some((o) => o.isCorrect)) {
        ctx.addIssue({ code: "custom", message: `Mark the correct answer${where}` });
      }
    });
  });

export async function savePoll(eventId: string, input: unknown, pollId?: string) {
  const parsed = pollSchema.safeParse(input);
  if (!parsed.success) throw new UserError(zodMessage(parsed.error));
  const { kind, questions } = parsed.data;
  const title = parsed.data.title || questions[0].text;

  const questionData = questions.map((q, i) => ({
    type: q.type,
    text: q.text,
    allowMultiple: q.type === "MULTIPLE_CHOICE" && !!q.allowMultiple,
    ratingMax: q.ratingMax ?? 5,
    timeLimitSec: q.timeLimitSec ?? 20,
    order: i,
    options: {
      create: (OPTION_TYPES.includes(q.type) ? (q.options ?? []) : []).map((o, j) => ({
        text: o.text,
        isCorrect: q.type === "QUIZ" && !!o.isCorrect,
        order: j,
      })),
    },
  }));

  if (!pollId) {
    const count = await prisma.poll.count({ where: { eventId } });
    return prisma.poll.create({
      data: { eventId, title, kind, order: count, questions: { create: questionData } },
    });
  }

  const existing = await getPoll(eventId, pollId);
  // Editing replaces the questions, which also clears their responses.
  return prisma.$transaction(async (tx) => {
    await tx.pollQuestion.deleteMany({ where: { pollId: existing.id } });
    return tx.poll.update({
      where: { id: existing.id },
      data: {
        title,
        presentIndex: 0,
        quizPhase: "LOBBY",
        quizIndex: -1,
        quizEndsAt: null,
        questions: { create: questionData },
      },
    });
  });
}

export async function deletePoll(eventId: string, pollId: unknown) {
  const poll = await getPoll(eventId, pollId);
  await prisma.$transaction([
    prisma.event.updateMany({
      where: { id: eventId, activePollId: poll.id },
      data: { activePollId: null },
    }),
    prisma.poll.delete({ where: { id: poll.id } }),
  ]);
}

export async function activatePoll(eventId: string, pollId: unknown) {
  const poll = await getPoll(eventId, pollId);
  await prisma.$transaction([
    prisma.poll.updateMany({
      where: { eventId, status: "ACTIVE", id: { not: poll.id } },
      data: { status: "CLOSED" },
    }),
    prisma.poll.update({ where: { id: poll.id }, data: { status: "ACTIVE" } }),
    prisma.event.update({ where: { id: eventId }, data: { activePollId: poll.id } }),
  ]);
}

export async function deactivatePoll(eventId: string) {
  await prisma.$transaction([
    prisma.poll.updateMany({ where: { eventId, status: "ACTIVE" }, data: { status: "CLOSED" } }),
    prisma.event.update({ where: { id: eventId }, data: { activePollId: null } }),
  ]);
}

const flagsSchema = z.object({
  pollId: z.string(),
  resultsVisible: z.boolean().optional(),
  votingLocked: z.boolean().optional(),
  presentIndex: z.number().int().min(0).optional(),
});

export async function setPollFlags(eventId: string, input: unknown) {
  const parsed = flagsSchema.safeParse(input);
  if (!parsed.success) throw new UserError(zodMessage(parsed.error));
  const { pollId, ...data } = parsed.data;
  const poll = await getPoll(eventId, pollId);
  if (data.presentIndex !== undefined) {
    data.presentIndex = Math.min(data.presentIndex, poll.questions.length - 1);
  }
  await prisma.poll.update({ where: { id: poll.id }, data });
}

// ---------- Responses ----------

function parseValue(raw: string): ResponseValue {
  return JSON.parse(raw) as ResponseValue;
}

export function validateResponse(q: PollQuestionWithOptions, raw: unknown): ResponseValue {
  const optionIds = new Set(q.options.map((o) => o.id));
  const bad = (message: string): never => {
    throw new UserError(message);
  };
  const value = (raw ?? {}) as Record<string, unknown>;

  switch (q.type) {
    case "MULTIPLE_CHOICE":
    case "QUIZ": {
      const ids = value.optionIds;
      if (!Array.isArray(ids) || ids.length === 0) bad("Pick an option");
      const unique = [...new Set(ids as unknown[])];
      if (!unique.every((id) => typeof id === "string" && optionIds.has(id))) bad("Unknown option");
      if ((q.type === "QUIZ" || !q.allowMultiple) && unique.length !== 1) bad("Pick exactly one option");
      return { optionIds: unique as string[] };
    }
    case "RATING": {
      const rating = value.rating;
      if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > q.ratingMax) {
        bad(`Pick a rating from 1 to ${q.ratingMax}`);
      }
      return { rating: rating as number };
    }
    case "WORD_CLOUD": {
      const words = Array.isArray(value.words)
        ? (value.words as unknown[])
            .filter((w): w is string => typeof w === "string")
            .map((w) => w.trim())
            .filter(Boolean)
        : [];
      if (words.length === 0) bad("Enter at least one word");
      if (words.length > 3) bad("Enter at most three words");
      if (words.some((w) => w.length > 40)) bad("Keep each entry under 40 characters");
      return { words };
    }
    case "OPEN_TEXT": {
      const text = typeof value.text === "string" ? value.text.trim() : "";
      if (!text) bad("Type an answer");
      if (text.length > 500) bad("Answers can be at most 500 characters");
      return { text };
    }
    case "RANKING": {
      const ranking = value.ranking;
      if (
        !Array.isArray(ranking) ||
        ranking.length !== optionIds.size ||
        new Set(ranking).size !== optionIds.size ||
        !ranking.every((id) => typeof id === "string" && optionIds.has(id))
      ) {
        bad("Rank every option");
      }
      return { ranking: ranking as string[] };
    }
    default:
      return bad("Unsupported question type");
  }
}

const respondSchema = z.object({ pollQuestionId: z.string(), value: z.unknown() });

export async function respond(eventId: string, participantId: string, input: unknown) {
  const parsed = respondSchema.safeParse(input);
  if (!parsed.success) throw new UserError(zodMessage(parsed.error));
  const question = await prisma.pollQuestion.findUnique({
    where: { id: parsed.data.pollQuestionId },
    include: { options: true, poll: { include: { event: true } } },
  });
  if (!question || question.poll.eventId !== eventId) throw new UserError("Poll not found");
  const { poll } = question;
  if (poll.event.archived) throw new UserError("This event has ended");
  if (poll.event.activePollId !== poll.id) throw new UserError("This poll is no longer active");
  if (poll.votingLocked) throw new UserError("Voting is closed");

  const value = validateResponse(question, parsed.data.value);
  const key = { pollQuestionId_participantId: { pollQuestionId: question.id, participantId } };

  if (poll.kind !== "QUIZ") {
    const json = JSON.stringify(value);
    await prisma.pollResponse.upsert({
      where: key,
      create: { pollQuestionId: question.id, participantId, value: json },
      update: { value: json, answeredAt: new Date() },
    });
    return { pollId: poll.id, score: null };
  }

  if (poll.quizPhase !== "QUESTION" || poll.quizIndex !== question.order) {
    throw new UserError("This question isn't open for answers");
  }
  const now = Date.now();
  const endsAt = poll.quizEndsAt?.getTime() ?? now;
  if (now > endsAt + QUIZ_GRACE_MS) throw new UserError("Time's up!");
  if (await prisma.pollResponse.findUnique({ where: key })) {
    throw new UserError("You've already answered");
  }
  const chosen = question.options.find((o) => "optionIds" in value && o.id === value.optionIds[0]);
  const score = quizScore(!!chosen?.isCorrect, endsAt - now, question.timeLimitSec * 1000);
  await prisma.pollResponse.create({
    data: { pollQuestionId: question.id, participantId, value: JSON.stringify(value), score },
  });
  return { pollId: poll.id, score };
}

// ---------- Results ----------

export async function computeResults(
  poll: PollWithQuestions,
  opts: { revealAnswersUpTo: number; onlyQuestions?: number },
): Promise<PollResultsDTO> {
  const questions = poll.questions.slice(0, opts.onlyQuestions ?? poll.questions.length);
  const responses = await prisma.pollResponse.findMany({
    where: { pollQuestionId: { in: questions.map((q) => q.id) } },
    orderBy: { answeredAt: "asc" },
    select: { id: true, pollQuestionId: true, participantId: true, value: true },
  });
  const byQuestion = new Map<string, { id: string; value: ResponseValue }[]>();
  const respondents = new Set<string>();
  for (const r of responses) {
    respondents.add(r.participantId);
    const list = byQuestion.get(r.pollQuestionId) ?? [];
    list.push({ id: r.id, value: parseValue(r.value) });
    byQuestion.set(r.pollQuestionId, list);
  }
  const results: PollResultsDTO = { pollId: poll.id, respondents: respondents.size, questions: {} };
  questions.forEach((q, i) => {
    results.questions[q.id] = aggregateQuestion(
      {
        type: q.type as PollQuestionType,
        ratingMax: q.ratingMax,
        options: q.options.map((o) => ({
          id: o.id,
          text: o.text,
          ...(q.type === "QUIZ" && i <= opts.revealAnswersUpTo ? { isCorrect: o.isCorrect } : {}),
        })),
      },
      byQuestion.get(q.id) ?? [],
    );
  });
  return results;
}

export async function quizStandings(poll: PollWithQuestions) {
  const responses = await prisma.pollResponse.findMany({
    where: { pollQuestion: { pollId: poll.id } },
    select: { participantId: true, score: true, pollQuestionId: true, participant: { select: { name: true } } },
  });
  const all = buildLeaderboard(
    responses.map((r) => ({ participantId: r.participantId, name: r.participant.name, score: r.score })),
    Infinity,
  );
  const current = poll.questions[poll.quizIndex]?.id;
  const me = new Map<string, QuizMeDTO>();
  for (const entry of all) {
    me.set(entry.participantId, {
      pollId: poll.id,
      total: entry.score,
      rank: entry.rank,
      players: all.length,
      lastScore: null,
      answered: [],
    });
  }
  for (const r of responses) {
    const mine = me.get(r.participantId)!;
    mine.answered.push(r.pollQuestionId);
    if (r.pollQuestionId === current) mine.lastScore = r.score;
  }
  return { leaderboard: all.slice(0, 10) as LeaderboardEntry[], me };
}

/** Builds what hosts and participants should see about the event's active poll. */
export async function activePollPayloads(activePollId: string | null) {
  const empty: ActivePollPayload = { poll: null, results: null, leaderboard: null };
  if (!activePollId) return { host: empty, participant: empty, poll: null };
  const poll = await prisma.poll.findUnique({ where: { id: activePollId }, include: pollInclude });
  if (!poll) return { host: empty, participant: empty, poll: null };

  if (poll.kind !== "QUIZ") {
    const results = await computeResults(poll, { revealAnswersUpTo: Infinity });
    return {
      poll,
      host: { poll: toPollDTO(poll, { revealAnswersUpTo: Infinity }), results, leaderboard: null },
      participant: {
        poll: toPollDTO(poll, { revealAnswersUpTo: -1 }),
        results: poll.resultsVisible ? results : null,
        leaderboard: null,
      },
    };
  }

  const phase = poll.quizPhase as QuizPhase;
  const revealed = phase === "REVEAL" || phase === "FINISHED";
  // Participants only see questions reached so far, and answers once revealed.
  const visible = phase === "FINISHED" ? poll.questions.length : Math.max(0, poll.quizIndex + 1);
  const revealUpTo = phase === "FINISHED" ? Infinity : revealed ? poll.quizIndex : poll.quizIndex - 1;
  const [hostResults, standings] = await Promise.all([
    computeResults(poll, { revealAnswersUpTo: Infinity }),
    quizStandings(poll),
  ]);
  return {
    poll,
    standings,
    host: {
      poll: toPollDTO(poll, { revealAnswersUpTo: Infinity }),
      results: hostResults,
      leaderboard: standings.leaderboard,
    },
    participant: {
      poll: toPollDTO(poll, { revealAnswersUpTo: revealUpTo, visibleQuestions: visible }),
      results: revealed
        ? await computeResults(poll, { revealAnswersUpTo: revealUpTo, onlyQuestions: visible })
        : null,
      leaderboard: revealed ? standings.leaderboard : null,
    },
  };
}

export async function answeredQuestionIds(participantId: string, eventId: string) {
  const responses = await prisma.pollResponse.findMany({
    where: { participantId, pollQuestion: { poll: { eventId } } },
    select: { pollQuestionId: true },
  });
  return responses.map((r) => r.pollQuestionId);
}
