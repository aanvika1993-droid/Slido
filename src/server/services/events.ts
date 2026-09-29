import type { Event } from "@prisma/client";
import { z } from "zod";
import type { EventDTO } from "@/lib/types";
import { prisma } from "../db";
import { UserError, zodMessage } from "../errors";

export function toEventDTO(e: Event): EventDTO {
  return {
    id: e.id,
    code: e.code,
    name: e.name,
    archived: e.archived,
    qaEnabled: e.qaEnabled,
    qaModeration: e.qaModeration,
    qaAnonymousAllowed: e.qaAnonymousAllowed,
    qaPaused: e.qaPaused,
    highlightedQuestionId: e.highlightedQuestionId,
    activePollId: e.activePollId,
  };
}

async function generateCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    if (!(await prisma.event.findUnique({ where: { code } }))) return code;
  }
  throw new Error("Could not generate a unique event code");
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Give your event a name").max(120),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional().nullable(),
});

export async function createEvent(ownerId: string, input: unknown) {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) throw new UserError(zodMessage(parsed.error));
  return prisma.event.create({
    data: { ...parsed.data, ownerId, code: await generateCode() },
  });
}

const settingsSchema = z
  .object({
    name: z.string().trim().min(1, "Event name can't be empty").max(120),
    archived: z.boolean(),
    qaEnabled: z.boolean(),
    qaModeration: z.boolean(),
    qaAnonymousAllowed: z.boolean(),
    qaPaused: z.boolean(),
  })
  .partial();

export async function updateEventSettings(eventId: string, input: unknown) {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) throw new UserError(zodMessage(parsed.error));
  return prisma.event.update({ where: { id: eventId }, data: parsed.data });
}
