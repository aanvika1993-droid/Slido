import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./auth";
import { prisma } from "./db";

export async function getCurrentUser() {
  const store = await cookies();
  const userId = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });
}

export async function getOwnedEvent(code: string) {
  const user = await getCurrentUser();
  if (!user) return { user: null, event: null };
  const event = await prisma.event.findUnique({ where: { code } });
  return { user, event: event && event.ownerId === user.id ? event : null };
}
