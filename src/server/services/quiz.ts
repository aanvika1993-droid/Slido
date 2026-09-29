import { z } from "zod";
import { prisma } from "../db";
import { UserError, zodMessage } from "../errors";
import { getPoll } from "./polls";

const g = globalThis as unknown as { quizTimers?: Map<string, NodeJS.Timeout> };
const timers = (g.quizTimers ??= new Map());

function clearTimer(pollId: string) {
  const t = timers.get(pollId);
  if (t) clearTimeout(t);
  timers.delete(pollId);
}

const controlSchema = z.object({
  pollId: z.string(),
  action: z.enum(["start", "reveal", "next", "finish", "reset"]),
});

/**
 * Moves a quiz through LOBBY → QUESTION → REVEAL → … → FINISHED.
 * `onTimeout` runs when a question's timer expires and it auto-reveals.
 */
export async function controlQuiz(eventId: string, input: unknown, onTimeout: () => void) {
  const parsed = controlSchema.safeParse(input);
  if (!parsed.success) throw new UserError(zodMessage(parsed.error));
  const poll = await getPoll(eventId, parsed.data.pollId);
  if (poll.kind !== "QUIZ") throw new UserError("This poll is not a quiz");
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  if (event.activePollId !== poll.id) throw new UserError("Activate the quiz first");

  const openQuestion = async (index: number) => {
    const q = poll.questions[index];
    const endsAt = new Date(Date.now() + q.timeLimitSec * 1000);
    await prisma.poll.update({
      where: { id: poll.id },
      data: { quizPhase: "QUESTION", quizIndex: index, quizEndsAt: endsAt, presentIndex: index },
    });
    clearTimer(poll.id);
    timers.set(
      poll.id,
      setTimeout(async () => {
        timers.delete(poll.id);
        const updated = await prisma.poll.updateMany({
          where: { id: poll.id, quizPhase: "QUESTION", quizIndex: index },
          data: { quizPhase: "REVEAL" },
        });
        if (updated.count) onTimeout();
      }, q.timeLimitSec * 1000 + 1000),
    );
  };

  switch (parsed.data.action) {
    case "start":
      if (poll.quizPhase !== "LOBBY") throw new UserError("The quiz has already started");
      await openQuestion(0);
      break;
    case "reveal":
      if (poll.quizPhase !== "QUESTION") throw new UserError("No question is open");
      clearTimer(poll.id);
      await prisma.poll.update({ where: { id: poll.id }, data: { quizPhase: "REVEAL" } });
      break;
    case "next":
      if (poll.quizPhase !== "REVEAL" && poll.quizPhase !== "QUESTION") {
        throw new UserError("Nothing to advance");
      }
      if (poll.quizIndex + 1 < poll.questions.length) {
        await openQuestion(poll.quizIndex + 1);
      } else {
        clearTimer(poll.id);
        await prisma.poll.update({ where: { id: poll.id }, data: { quizPhase: "FINISHED" } });
      }
      break;
    case "finish":
      clearTimer(poll.id);
      await prisma.poll.update({ where: { id: poll.id }, data: { quizPhase: "FINISHED" } });
      break;
    case "reset":
      clearTimer(poll.id);
      await prisma.$transaction([
        prisma.pollResponse.deleteMany({ where: { pollQuestion: { pollId: poll.id } } }),
        prisma.poll.update({
          where: { id: poll.id },
          data: { quizPhase: "LOBBY", quizIndex: -1, quizEndsAt: null, presentIndex: 0 },
        }),
      ]);
      break;
  }
}
