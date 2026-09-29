import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { UserError } from "@/server/errors";
import { errorResponse, readJson, withSession } from "@/server/http";

const schema = z.object({ email: z.string().trim().toLowerCase(), password: z.string() });

export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new UserError("Enter your email and password");
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      throw new UserError("Wrong email or password");
    }
    return withSession(NextResponse.json({ ok: true }), user.id);
  } catch (err) {
    return errorResponse(err);
  }
}
