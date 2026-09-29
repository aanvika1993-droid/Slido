import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { errorResponse, readJson } from "@/server/http";
import { updateEventSettings } from "@/server/services/events";
import { getOwnedEvent } from "@/server/session";

type Params = { params: Promise<{ code: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { event } = await getOwnedEvent((await params).code);
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
    await updateEventSettings(event.id, await readJson(req));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { event } = await getOwnedEvent((await params).code);
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
    await prisma.event.delete({ where: { id: event.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
