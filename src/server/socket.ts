import { randomBytes } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { z } from "zod";
import type { Ack, JoinResult, Role } from "@/lib/types";
import { readCookie, SESSION_COOKIE, verifySessionToken } from "./auth";
import { prisma } from "./db";
import { UserError, zodMessage } from "./errors";
import {
  broadcastActivePoll,
  broadcastEvent,
  broadcastPolls,
  broadcastQuestions,
  rooms,
  setIO,
} from "./realtime";
import { toEventDTO, updateEventSettings } from "./services/events";
import {
  activatePoll,
  activePollPayloads,
  answeredQuestionIds,
  computeResults,
  deactivatePoll,
  deletePoll,
  getPoll,
  listPolls,
  quizStandings,
  respond,
  savePoll,
  setPollFlags,
} from "./services/polls";
import {
  askQuestion,
  deleteOwnQuestion,
  editOwnQuestion,
  listQuestions,
  moderateQuestion,
  toggleVote,
} from "./services/qa";
import { controlQuiz } from "./services/quiz";

interface SocketData {
  userId: string | null;
  eventId?: string;
  role?: Role;
  participantId?: string;
}

type AppSocket = Socket<Record<string, never>, Record<string, never>, Record<string, never>, SocketData>;

const joinSchema = z.object({
  code: z.string().trim(),
  role: z.enum(["participant", "admin", "present"]),
  token: z.string().optional(),
});

export function registerSocketHandlers(io: Server) {
  setIO(io);

  io.use(async (socket, next) => {
    const cookie = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
    socket.data.userId = await verifySessionToken(cookie);
    next();
  });

  io.on("connection", (raw) => {
    const socket = raw as unknown as AppSocket;

    const handle = <T>(name: string, fn: (payload: unknown) => Promise<T>) => {
      socket.on(name, async (payload: unknown, ack?: (res: Ack<T>) => void) => {
        try {
          const data = await fn(payload ?? {});
          ack?.({ ok: true, data });
        } catch (err) {
          if (!(err instanceof UserError)) console.error(`socket ${name} failed`, err);
          ack?.({ ok: false, error: err instanceof UserError ? err.message : "Something went wrong" });
        }
      });
    };

    const joined = () => {
      const { eventId, role } = socket.data;
      if (!eventId || !role) throw new UserError("Join the event first");
      return { eventId, role };
    };
    const asParticipant = async () => {
      const { eventId } = joined();
      const participantId = socket.data.participantId;
      if (!participantId) throw new UserError("Only participants can do that");
      const [event, participant] = await Promise.all([
        prisma.event.findUniqueOrThrow({ where: { id: eventId } }),
        prisma.participant.findUniqueOrThrow({ where: { id: participantId } }),
      ]);
      return { event, participant };
    };
    const asAdmin = () => {
      const ctx = joined();
      if (ctx.role !== "admin") throw new UserError("Only the host can do that");
      return ctx.eventId;
    };

    handle("join", async (payload): Promise<JoinResult> => {
      const parsed = joinSchema.safeParse(payload);
      if (!parsed.success) throw new UserError(zodMessage(parsed.error));
      const { code, role, token } = parsed.data;
      const event = await prisma.event.findUnique({ where: { code: code.replace(/^#/, "") } });
      if (!event) throw new UserError("We couldn't find an event with that code");
      const isHost = role !== "participant";
      if (isHost && socket.data.userId !== event.ownerId) throw new UserError("You're not the host of this event");

      if (socket.data.eventId && socket.data.role) {
        await socket.leave(rooms[socket.data.role](socket.data.eventId));
      }
      socket.data.eventId = event.id;
      socket.data.role = role;
      await socket.join(rooms[role](event.id));

      const [questions, payloads] = await Promise.all([
        listQuestions(event.id, role === "admin"),
        activePollPayloads(event.activePollId),
      ]);
      const result: JoinResult = {
        event: toEventDTO(event),
        questions,
        activePoll: isHost ? payloads.host : payloads.participant,
      };

      if (role === "admin") result.polls = await listPolls(event.id);
      if (role === "participant") {
        let participant = token ? await prisma.participant.findUnique({ where: { token } }) : null;
        if (!participant || participant.eventId !== event.id) {
          participant = await prisma.participant.create({
            data: { eventId: event.id, token: randomBytes(24).toString("base64url") },
          });
        }
        socket.data.participantId = participant.id;
        const [votes, answered] = await Promise.all([
          prisma.questionVote.findMany({
            where: { participantId: participant.id },
            select: { questionId: true },
          }),
          answeredQuestionIds(participant.id, event.id),
        ]);
        result.me = {
          id: participant.id,
          token: participant.token,
          name: participant.name,
          votedQuestionIds: votes.map((v) => v.questionId),
          answeredPollQuestionIds: answered,
        };
        if (payloads.poll?.kind === "QUIZ") broadcastActivePoll(event.id); // sends this socket its quiz:me
      }
      return result;
    });

    // ----- Participant actions -----

    handle("participant:rename", async (payload) => {
      const { participant } = await asParticipant();
      const parsed = z
        .object({ name: z.string().trim().max(40, "Names can be at most 40 characters") })
        .safeParse(payload);
      if (!parsed.success) throw new UserError(zodMessage(parsed.error));
      const updated = await prisma.participant.update({
        where: { id: participant.id },
        data: { name: parsed.data.name || null },
      });
      return { name: updated.name };
    });

    handle("qa:ask", async (payload) => {
      const { event, participant } = await asParticipant();
      const result = await askQuestion(event, participant, payload);
      broadcastQuestions(event.id);
      return result;
    });

    handle("qa:vote", async (payload) => {
      const { event, participant } = await asParticipant();
      const result = await toggleVote(event.id, participant.id, (payload as { questionId?: unknown }).questionId);
      broadcastQuestions(event.id);
      return result;
    });

    handle("qa:edit", async (payload) => {
      const { event, participant } = await asParticipant();
      await editOwnQuestion(event.id, participant.id, payload);
      broadcastQuestions(event.id);
      return null;
    });

    handle("qa:delete", async (payload) => {
      const { event, participant } = await asParticipant();
      await deleteOwnQuestion(event.id, participant.id, (payload as { questionId?: unknown }).questionId);
      broadcastQuestions(event.id);
      broadcastEvent(event.id);
      return null;
    });

    handle("poll:respond", async (payload) => {
      const { event, participant } = await asParticipant();
      // Quiz scores are not returned here; they stay hidden until the host reveals the answer.
      await respond(event.id, participant.id, payload);
      broadcastActivePoll(event.id);
      broadcastPolls(event.id);
      return null;
    });

    // ----- Host actions -----

    handle("event:update", async (payload) => {
      const eventId = asAdmin();
      await updateEventSettings(eventId, payload);
      broadcastEvent(eventId);
      return null;
    });

    handle("qa:moderate", async (payload) => {
      const eventId = asAdmin();
      const eventChanged = await moderateQuestion(eventId, payload);
      broadcastQuestions(eventId);
      if (eventChanged) broadcastEvent(eventId);
      return null;
    });

    const pollsChanged = (eventId: string) => {
      broadcastEvent(eventId);
      broadcastPolls(eventId);
      broadcastActivePoll(eventId);
    };

    handle("poll:save", async (payload) => {
      const eventId = asAdmin();
      const { pollId, poll } = (payload ?? {}) as { pollId?: string; poll?: unknown };
      const saved = await savePoll(eventId, poll, pollId);
      pollsChanged(eventId);
      return { id: saved.id };
    });

    handle("poll:delete", async (payload) => {
      const eventId = asAdmin();
      await deletePoll(eventId, (payload as { pollId?: unknown }).pollId);
      pollsChanged(eventId);
      return null;
    });

    handle("poll:activate", async (payload) => {
      const eventId = asAdmin();
      await activatePoll(eventId, (payload as { pollId?: unknown }).pollId);
      pollsChanged(eventId);
      return null;
    });

    handle("poll:deactivate", async () => {
      const eventId = asAdmin();
      await deactivatePoll(eventId);
      pollsChanged(eventId);
      return null;
    });

    handle("poll:flags", async (payload) => {
      const eventId = asAdmin();
      await setPollFlags(eventId, payload);
      pollsChanged(eventId);
      return null;
    });

    handle("poll:results", async (payload) => {
      const eventId = asAdmin();
      const poll = await getPoll(eventId, (payload as { pollId?: unknown }).pollId);
      const results = await computeResults(poll, { revealAnswersUpTo: Infinity });
      const leaderboard = poll.kind === "QUIZ" ? (await quizStandings(poll)).leaderboard : null;
      return { results, leaderboard };
    });

    handle("quiz:control", async (payload) => {
      const eventId = asAdmin();
      await controlQuiz(eventId, payload, () => pollsChanged(eventId));
      pollsChanged(eventId);
      return null;
    });
  });
}
