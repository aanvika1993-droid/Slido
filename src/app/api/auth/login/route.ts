import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { UserError } from "@/server/errors";
import { errorResponse, readJson, withSession } from "@/server/http";
import { CLIENT_IP_HEADER } from "@/server/network";
import { TOO_FAST, hit } from "@/server/rateLimit";

const schema = z.object({ email: z.string().trim().toLowerCase(), password: z.string() });
const WINDOW_MS = 15 * 60_000;
// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new UserError("Enter your email and password");
    const ip = req.headers.get(CLIENT_IP_HEADER) ?? "unknown";
    const { email, password } = parsed.data;
    if (!hit(`login:ip:${ip}`, 30, WINDOW_MS) || !hit(`login:email:${email}`, 10, WINDOW_MS)) {
      return NextResponse.json({ error: TOO_FAST }, { status: 429 });
    }
    const user = await prisma.user.findUnique({ where: { email } });
    const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) throw new UserError("Wrong email or password");
    return withSession(NextResponse.json({ ok: true }), user.id);
  } catch (err) {
    return errorResponse(err);
  }
}
