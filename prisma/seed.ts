import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@example.com";
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Demo Host", passwordHash: await bcrypt.hash("password123", 10) },
  });

  await prisma.event.deleteMany({ where: { code: "123456" } });
  const event = await prisma.event.create({
    data: { code: "123456", name: "Demo all-hands", ownerId: user.id },
  });

  const alice = await prisma.participant.create({ data: { eventId: event.id, token: "seed-alice", name: "Alice" } });
  const bob = await prisma.participant.create({ data: { eventId: event.id, token: "seed-bob" } });

  const q1 = await prisma.question.create({
    data: { eventId: event.id, participantId: alice.id, authorName: "Alice", text: "What are the priorities for next quarter?" },
  });
  await prisma.question.create({
    data: { eventId: event.id, participantId: bob.id, text: "Will we get a remote-work stipend?" },
  });
  await prisma.questionVote.create({ data: { questionId: q1.id, participantId: bob.id } });

  await prisma.poll.create({
    data: {
      eventId: event.id,
      title: "How's your week going?",
      order: 0,
      questions: {
        create: {
          type: "MULTIPLE_CHOICE",
          text: "How's your week going?",
          order: 0,
          options: { create: ["Great", "Okay", "Could be better"].map((text, order) => ({ text, order })) },
        },
      },
    },
  });
  await prisma.poll.create({
    data: {
      eventId: event.id,
      title: "One word for this meeting",
      order: 1,
      questions: { create: { type: "WORD_CLOUD", text: "Describe this meeting in one word", order: 0 } },
    },
  });
  await prisma.poll.create({
    data: {
      eventId: event.id,
      title: "Company trivia",
      kind: "QUIZ",
      order: 2,
      questions: {
        create: [
          {
            type: "QUIZ",
            text: "What year was the company founded?",
            order: 0,
            timeLimitSec: 20,
            options: { create: ["2015", "2018", "2020"].map((text, order) => ({ text, order, isCorrect: text === "2018" })) },
          },
          {
            type: "QUIZ",
            text: "How many offices do we have?",
            order: 1,
            timeLimitSec: 15,
            options: { create: ["2", "4", "7"].map((text, order) => ({ text, order, isCorrect: text === "4" })) },
          },
        ],
      },
    },
  });

  console.log("Seeded. Log in as demo@example.com / password123 — event code 123456");
}

main().finally(() => prisma.$disconnect());
