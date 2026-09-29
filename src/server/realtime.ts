import type { Server } from "socket.io";
import type { QuizMeDTO } from "@/lib/types";
import { prisma } from "./db";
import { toEventDTO } from "./services/events";
import { activePollPayloads, listPolls } from "./services/polls";
import { listQuestions } from "./services/qa";

const g = globalThis as unknown as { io?: Server; pendingBroadcasts?: Map<string, NodeJS.Timeout> };
const pending = (g.pendingBroadcasts ??= new Map());

export function setIO(io: Server) {
  g.io = io;
}

function io(): Server {
  if (!g.io) throw new Error("Socket.IO server not initialised");
  return g.io;
}

export const rooms = {
  participant: (eventId: string) => `ev:${eventId}:participant`,
  admin: (eventId: string) => `ev:${eventId}:admin`,
  present: (eventId: string) => `ev:${eventId}:present`,
};

const hostRooms = (eventId: string) => [rooms.admin(eventId), rooms.present(eventId)];
const allRooms = (eventId: string) => [rooms.participant(eventId), ...hostRooms(eventId)];

/** Coalesces bursts of changes (e.g. many upvotes) into one broadcast per channel. */
function schedule(key: string, fn: () => Promise<void>) {
  if (pending.has(key)) return;
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key);
      fn().catch((err) => console.error(`broadcast ${key} failed`, err));
    }, 80),
  );
}

export function broadcastEvent(eventId: string) {
  schedule(`event:${eventId}`, async () => {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (event) io().to(allRooms(eventId)).emit("event:state", toEventDTO(event));
  });
}

export function broadcastQuestions(eventId: string) {
  schedule(`questions:${eventId}`, async () => {
    const [all, visible] = await Promise.all([listQuestions(eventId, true), listQuestions(eventId, false)]);
    io().to(rooms.admin(eventId)).emit("questions", all);
    io().to([rooms.participant(eventId), rooms.present(eventId)]).emit("questions", visible);
  });
}

export function broadcastPolls(eventId: string) {
  schedule(`polls:${eventId}`, async () => {
    io().to(rooms.admin(eventId)).emit("polls", await listPolls(eventId));
  });
}

export function broadcastActivePoll(eventId: string) {
  schedule(`activePoll:${eventId}`, async () => {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) return;
    const payloads = await activePollPayloads(event.activePollId);
    io().to(hostRooms(eventId)).emit("activePoll", payloads.host);
    io().to(rooms.participant(eventId)).emit("activePoll", payloads.participant);

    if (payloads.poll?.kind === "QUIZ" && "standings" in payloads && payloads.standings) {
      const { me } = payloads.standings;
      const sockets = await io().in(rooms.participant(eventId)).fetchSockets();
      for (const s of sockets) {
        const mine: QuizMeDTO = me.get(s.data.participantId) ?? {
          pollId: payloads.poll.id,
          total: 0,
          rank: null,
          players: me.size,
          lastScore: null,
          answered: [],
        };
        s.emit("quiz:me", mine);
      }
    }
  });
}
