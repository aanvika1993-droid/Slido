"use client";

import Link from "next/link";
import { useState } from "react";
import { HostHeader } from "@/components/HostHeader";
import { JoinQr, useJoinUrl } from "@/components/JoinInfo";
import { Badge, Card, Spinner, Tabs } from "@/components/ui";
import { useEventRoom } from "@/lib/socket-client";
import { AdminAnalytics } from "./AdminAnalytics";
import { AdminPolls } from "./AdminPolls";
import { AdminQA } from "./AdminQA";
import { AdminSettings } from "./AdminSettings";

type Tab = "qa" | "polls" | "analytics" | "settings";

export function AdminClient({ code, userName }: { code: string; userName: string }) {
  const room = useEventRoom(code, "admin");
  const [tab, setTab] = useState<Tab>("qa");
  const { url, host } = useJoinUrl(code);

  if (room.status !== "ready" || !room.event) {
    return (
      <div className="min-h-screen">
        <HostHeader userName={userName} />
        <div className="flex justify-center py-20">{room.error ? <p className="text-red-600">{room.error}</p> : <Spinner />}</div>
      </div>
    );
  }
  const { event } = room;
  const pending = room.questions.filter((q) => q.status === "PENDING").length;

  return (
    <div className="min-h-screen">
      <HostHeader userName={userName}>
        <span className="hidden text-gray-300 sm:inline">/</span>
        <span className="truncate font-medium">{event.name}</span>
        {!room.connected && <Badge tone="amber">Reconnecting…</Badge>}
      </HostHeader>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <Card className="mb-6 flex flex-wrap items-center gap-5 p-4">
          <JoinQr code={code} size={72} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-500">
              Join at <span className="font-medium text-gray-800">{host}/event</span> with code
            </p>
            <p className="text-3xl font-bold tracking-wider">#{event.code}</p>
            {url && (
              <button className="text-xs text-brand-700 hover:underline" onClick={() => navigator.clipboard?.writeText(url)}>
                Copy participant link
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/present/${code}`} target="_blank" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
              ▶ Present mode
            </Link>
            <Link href={`/event/${code}`} target="_blank" className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50">
              Participant view
            </Link>
          </div>
        </Card>

        <Tabs
          className="mb-6"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "qa", label: <>Q&amp;A {pending > 0 && <Badge tone="amber">{pending}</Badge>}</> },
            { id: "polls", label: <>Polls {event.activePollId && <span className="ml-1 inline-block h-2 w-2 rounded-full bg-brand-500" />}</> },
            { id: "analytics", label: "Analytics" },
            { id: "settings", label: "Settings" },
          ]}
        />

        {tab === "qa" && <AdminQA room={room} />}
        {tab === "polls" && <AdminPolls room={room} />}
        {tab === "analytics" && <AdminAnalytics code={code} />}
        {tab === "settings" && <AdminSettings room={room} />}
      </div>
    </div>
  );
}
