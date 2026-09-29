import { NextResponse } from "next/server";
import { errorResponse, readJson } from "@/server/http";
import { createEvent } from "@/server/services/events";
import { getCurrentUser } from "@/server/session";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
    const event = await createEvent(user.id, await readJson(req));
    return NextResponse.json({ code: event.code });
  } catch (err) {
    return errorResponse(err);
  }
}
