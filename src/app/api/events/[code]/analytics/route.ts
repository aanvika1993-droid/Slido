import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { getOwnedEvent } from "@/server/session";

type Params = { params: Promise<{ code: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { event } = await getOwnedEvent((await params).code);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const eventId = event.id;

  const [participants, questionsByStatus, questionVotes, polls, responders] = await Promise.all([
    prisma.participant.count({ where: { eventId } }),
    prisma.question.groupBy({ by: ["status"], where: { eventId }, _count: true }),
    prisma.questionVote.count({ where: { question: { eventId } } }),
    prisma.poll.findMany({
      where: { eventId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        kind: true,
        questions: { select: { _count: { select: { responses: true } } } },
      },
    }),
    prisma.pollResponse.findMany({
      where: { pollQuestion: { poll: { eventId } } },
      distinct: ["participantId"],
      select: { participantId: true },
    }),
  ]);
  const questionCounts = Object.fromEntries(questionsByStatus.map((g) => [g.status, g._count]));
  const askers = await prisma.question.findMany({ where: { eventId }, distinct: ["participantId"], select: { participantId: true } });
  const active = new Set([...responders, ...askers].map((r) => r.participantId));

  return NextResponse.json({
    participants,
    activeParticipants: active.size,
    questions: {
      total: Object.values(questionCounts).reduce((a, b) => a + b, 0),
      live: questionCounts.LIVE ?? 0,
      answered: questionCounts.ANSWERED ?? 0,
      pending: questionCounts.PENDING ?? 0,
      rejected: questionCounts.REJECTED ?? 0,
    },
    questionVotes,
    polls: polls.map((p) => ({
      id: p.id,
      title: p.title,
      kind: p.kind,
      questions: p.questions.length,
      responses: p.questions.reduce((a, q) => a + q._count.responses, 0),
    })),
    pollResponders: responders.length,
  });
}
