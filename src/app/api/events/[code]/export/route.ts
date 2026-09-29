import { NextResponse } from "next/server";
import { toCsv } from "@/lib/csv";
import type { ResponseValue } from "@/lib/types";
import { prisma } from "@/server/db";
import { getOwnedEvent } from "@/server/session";

type Params = { params: Promise<{ code: string }> };

function describeAnswer(value: ResponseValue, options: Map<string, string>): string {
  if ("optionIds" in value) return value.optionIds.map((id) => options.get(id) ?? "?").join("; ");
  if ("rating" in value) return String(value.rating);
  if ("words" in value) return value.words.join("; ");
  if ("text" in value) return value.text;
  return value.ranking.map((id, i) => `${i + 1}. ${options.get(id) ?? "?"}`).join("; ");
}

export async function GET(req: Request, { params }: Params) {
  const { code } = await params;
  const { event } = await getOwnedEvent(code);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const type = new URL(req.url).searchParams.get("type") === "polls" ? "polls" : "questions";

  let csv: string;
  if (type === "questions") {
    const questions = await prisma.question.findMany({
      where: { eventId: event.id },
      include: { _count: { select: { votes: true } } },
      orderBy: { createdAt: "asc" },
    });
    csv = toCsv(
      ["Question", "Author", "Status", "Starred", "Upvotes", "Asked at"],
      questions.map((q) => [q.text, q.authorName ?? "Anonymous", q.status, q.starred ? "yes" : "no", q._count.votes, q.createdAt]),
    );
  } else {
    const polls = await prisma.poll.findMany({
      where: { eventId: event.id },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: {
        questions: {
          orderBy: { order: "asc" },
          include: {
            options: true,
            responses: { include: { participant: { select: { name: true } } }, orderBy: { answeredAt: "asc" } },
          },
        },
      },
    });
    const rows: unknown[][] = [];
    for (const poll of polls) {
      for (const q of poll.questions) {
        const options = new Map(q.options.map((o) => [o.id, o.text]));
        for (const r of q.responses) {
          rows.push([
            poll.title,
            q.text,
            q.type,
            r.participant.name ?? "Anonymous",
            describeAnswer(JSON.parse(r.value) as ResponseValue, options),
            poll.kind === "QUIZ" ? r.score : "",
            r.answeredAt,
          ]);
        }
      }
    }
    csv = toCsv(["Poll", "Question", "Type", "Participant", "Answer", "Score", "Answered at"], rows);
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="event-${event.code}-${type}.csv"`,
    },
  });
}
