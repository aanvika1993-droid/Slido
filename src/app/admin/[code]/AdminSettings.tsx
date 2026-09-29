"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Input, Switch, useToast } from "@/components/ui";
import type { EventRoom } from "@/lib/socket-client";

export function AdminSettings({ room }: { room: EventRoom }) {
  const toast = useToast();
  const router = useRouter();
  const event = room.event!;
  const [name, setName] = useState(event.name);

  const update = (patch: Record<string, unknown>, message?: string) =>
    room.call("event:update", patch).then(
      () => message && toast(message),
      (err: Error) => toast(err.message, "error"),
    );

  const remove = async () => {
    if (!confirm(`Delete "${event.name}"? All questions, polls and results will be permanently removed.`)) return;
    const res = await fetch(`/api/events/${event.code}`, { method: "DELETE" });
    if (res.ok) router.push("/dashboard");
    else toast("Couldn't delete the event", "error");
  };

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="p-5">
        <h2 className="mb-4 font-semibold">General</h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            update({ name }, "Event renamed");
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-label="Event name" />
          <Button type="submit" disabled={!name.trim() || name === event.name}>
            Save
          </Button>
        </form>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">Q&amp;A</h2>
        <Switch checked={event.qaEnabled} onChange={(v) => update({ qaEnabled: v })} label="Enable Q&A" description="Let participants ask and upvote questions." />
        <Switch checked={event.qaModeration} onChange={(v) => update({ qaModeration: v })} label="Moderation" description="Approve each question before others can see it." />
        <Switch checked={event.qaAnonymousAllowed} onChange={(v) => update({ qaAnonymousAllowed: v })} label="Allow anonymous questions" />
        <Switch checked={event.qaPaused} onChange={(v) => update({ qaPaused: v })} label="Pause Q&A" description="Temporarily stop new questions." />
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">Event status</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600">
            {event.archived ? "This event is archived. Participants can view it but can't ask questions." : "Archive the event when it's over."}
          </p>
          <Button variant="secondary" onClick={() => update({ archived: !event.archived }, event.archived ? "Event restored" : "Event archived")}>
            {event.archived ? "Restore event" : "Archive event"}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <p className="text-sm text-gray-600">Permanently delete this event and all of its data.</p>
          <Button variant="danger" onClick={remove}>
            Delete event
          </Button>
        </div>
      </Card>
    </div>
  );
}
