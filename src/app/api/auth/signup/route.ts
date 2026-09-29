import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { UserError, zodMessage } from "@/server/errors";
import { errorResponse, readJson, withSession } from "@/server/http";

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  password: z.string().min(8, "Passwords need at least 8 characters").max(200),
});

export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new UserError(zodMessage(parsed.error));
    const { name, email, password } = parsed.data;
    if (await prisma.user.findUnique({ where: { email } })) {
      throw new UserError("An account with that email already exists");
    }
    const user = await prisma.user.create({
      data: { name, email, passwordHash: await bcrypt.hash(password, 10) },
    });
    return withSession(NextResponse.json({ ok: true }), user.id);
  } catch (err) {
    return errorResponse(err);
  }
}
