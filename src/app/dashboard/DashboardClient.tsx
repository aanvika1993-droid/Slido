"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, Input, Modal, Tabs, useToast } from "@/components/ui";

interface EventRow {
  code: string;
  name: string;
  archived: boolean;
  startsAt: string;
  participants: number;
  questions: number;
  polls: number;
}

export function DashboardClient({ events }: { events: EventRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"active" | "archived">("active");
  const shown = events.filter((e) => e.archived === (filter === "archived"));

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
    if (res.ok && data.code) {
      router.push(`/admin/${data.code}`);
    } else {
      toast(data.error ?? "Couldn't create the event", "error");
      setBusy(false);
    }
  };

  const setArchived = async (code: string, archived: boolean) => {
    const res = await fetch(`/api/events/${code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    });
    if (res.ok) router.refresh();
    else toast("Couldn't update the event", "error");
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">My events</h1>
        <Button onClick={() => setCreating(true)}>+ Create event</Button>
      </div>

      <Tabs
        className="mb-4"
        value={filter}
        onChange={setFilter}
        tabs={[
          { id: "active", label: `Active (${events.filter((e) => !e.archived).length})` },
          { id: "archived", label: `Archived (${events.filter((e) => e.archived).length})` },
        ]}
      />

      {shown.length === 0 ? (
        <Card>
          <EmptyState title={filter === "active" ? "No events yet" : "No archived events"}>
            {filter === "active" && "Create an event to get a join code for your audience."}
          </EmptyState>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((e) => (
            <li key={e.code}>
              <Card className="flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/admin/${e.code}`} className="font-semibold hover:text-brand-700">
                    {e.name}
                  </Link>
                  <Badge tone={e.archived ? "gray" : "green"}>#{e.code}</Badge>
                </div>
                <p className="mt-1 text-xs text-gray-500">{new Date(e.startsAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</p>
                <p className="mt-3 text-sm text-gray-600">
                  {e.participants} participants · {e.questions} questions · {e.polls} polls
                </p>
                <div className="mt-4 flex gap-2 pt-1">
                  <Link href={`/admin/${e.code}`} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
                    Open
                  </Link>
                  <Button size="sm" variant="ghost" onClick={() => setArchived(e.code, !e.archived)}>
                    {e.archived ? "Restore" : "Archive"}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Create event">
        <form onSubmit={create} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Event name</span>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. All-hands, March" maxLength={120} required />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
