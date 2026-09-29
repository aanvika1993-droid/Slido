import { PrismaClient } from "@prisma/client";

// The custom server and Next.js bundles share one process, so cache on globalThis.
const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
g.prisma = prisma;
