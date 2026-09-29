import type { Event, Participant } from "@prisma/client";
import { z } from "zod";
import type { QuestionDTO, QuestionStatus } from "@/lib/types";
import { prisma } from "../db";
import { UserError, zodMessage } from "../errors";

export const MAX_QUESTION_LENGTH = 280;

export async function listQuestions(eventId: string, includeHidden: boolean): Promise<QuestionDTO[]> {
  const questions = await prisma.question.findMany({
    where: { eventId, ...(includeHidden ? {} : { status: { in: ["LIVE", "ANSWERED"] } }) },
    include: { _count: { select: { votes: true } } },
    orderBy: { createdAt: "desc" },
  });
  return questions.map((q) => ({
    id: q.id,
    text: q.text,
    authorName: q.authorName,
    authorId: q.participantId,
    status: q.status as QuestionStatus,
    starred: q.starred,
    votes: q._count.votes,
    createdAt: q.createdAt.toISOString(),
  }));
}

const textSchema = z
  .string()
  .trim()
  .min(1, "Type a question first")
  .max(MAX_QUESTION_LENGTH, `Questions can be at most ${MAX_QUESTION_LENGTH} characters`);

const askSchema = z.object({ text: textSchema, anonymous: z.boolean().optional() });

export async function askQuestion(event: Event, participant: Participant, input: unknown) {
  if (!event.qaEnabled) throw new UserError("Q&A is turned off for this event");
  if (event.qaPaused) throw new UserError("The host has paused questions");
  if (event.archived) throw new UserError("This event has ended");
  const parsed = askSchema.safeParse(input);
  if (!parsed.success) throw new UserError(zodMessage(parsed.error));

  const anonymous = parsed.data.anonymous ?? !participant.name;
  if (anonymous && !event.qaAnonymousAllowed) {
    throw new UserError("Please add your name to ask a question");
  }
  if (!anonymous && !participant.name) throw new UserError("Add your name first");

  const question = await prisma.question.create({
    data: {
      eventId: event.id,
      participantId: participant.id,
      authorName: anonymous ? null : participant.name,
      text: parsed.data.text,
      status: event.qaModeration ? "PENDING" : "LIVE",
    },
  });
  return { id: question.id, status: question.status as QuestionStatus };
}

async function findQuestion(eventId: string, questionId: unknown) {
  if (typeof questionId !== "string") throw new UserError("Question not found");
  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question || question.eventId !== eventId) throw new UserError("Question not found");
  return question;
}

/** Toggles the participant's upvote and returns whether they now have a vote on it. */
export async function toggleVote(eventId: string, participantId: string, questionId: unknown) {
  const question = await findQuestion(eventId, questionId);
  if (question.status !== "LIVE") throw new UserError("You can only vote on live questions");
  const key = { questionId_participantId: { questionId: question.id, participantId } };
  const existing = await prisma.questionVote.findUnique({ where: key });
  if (existing) {
    await prisma.questionVote.delete({ where: key });
    return { voted: false };
  }
  await prisma.questionVote.create({ data: { questionId: question.id, participantId } });
  return { voted: true };
}

export async function editOwnQuestion(eventId: string, participantId: string, input: unknown) {
  const parsed = z.object({ questionId: z.string(), text: textSchema }).safeParse(input);
  if (!parsed.success) throw new UserError(zodMessage(parsed.error));
  const question = await findQuestion(eventId, parsed.data.questionId);
  if (question.participantId !== participantId) throw new UserError("You can only edit your own questions");
  if (question.status === "ANSWERED" || question.status === "REJECTED") {
    throw new UserError("This question can no longer be edited");
  }
  await prisma.question.update({ where: { id: question.id }, data: { text: parsed.data.text } });
}

export async function deleteOwnQuestion(eventId: string, participantId: string, questionId: unknown) {
  const question = await findQuestion(eventId, questionId);
  if (question.participantId !== participantId) throw new UserError("You can only delete your own questions");
  await prisma.question.delete({ where: { id: question.id } });
  await clearHighlightIf(eventId, question.id);
}

async function clearHighlightIf(eventId: string, questionId: string) {
  await prisma.event.updateMany({
    where: { id: eventId, highlightedQuestionId: questionId },
    data: { highlightedQuestionId: null },
  });
}

export const MODERATION_ACTIONS = [
  "approve",
  "reject",
  "answer",
  "unanswer",
  "restore",
  "star",
  "unstar",
  "highlight",
  "unhighlight",
  "delete",
] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

/** Returns true when the event itself changed (the highlighted question). */
export async function moderateQuestion(eventId: string, input: unknown): Promise<boolean> {
  const parsed = z
    .object({ questionId: z.string(), action: z.enum(MODERATION_ACTIONS) })
    .safeParse(input);
  if (!parsed.success) throw new UserError(zodMessage(parsed.error));
  const question = await findQuestion(eventId, parsed.data.questionId);
  const setStatus = (status: QuestionStatus) =>
    prisma.question.update({ where: { id: question.id }, data: { status } });

  switch (parsed.data.action) {
    case "approve":
    case "unanswer":
    case "restore":
      await setStatus("LIVE");
      return false;
    case "reject":
      await setStatus("REJECTED");
      await clearHighlightIf(eventId, question.id);
      return true;
    case "answer":
      await setStatus("ANSWERED");
      await clearHighlightIf(eventId, question.id);
      return true;
    case "star":
    case "unstar":
      await prisma.question.update({
        where: { id: question.id },
        data: { starred: parsed.data.action === "star" },
      });
      return false;
    case "highlight":
      if (question.status !== "LIVE") await setStatus("LIVE");
      await prisma.event.update({ where: { id: eventId }, data: { highlightedQuestionId: question.id } });
      return true;
    case "unhighlight":
      await clearHighlightIf(eventId, question.id);
      return true;
    case "delete":
      await prisma.question.delete({ where: { id: question.id } });
      await clearHighlightIf(eventId, question.id);
      return true;
  }
}
