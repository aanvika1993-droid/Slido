"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Spinner } from "@/components/ui";

interface Analytics {
  participants: number;
  activeParticipants: number;
  questions: { total: number; live: number; answered: number; pending: number; rejected: number };
  questionVotes: number;
  polls: { id: string; title: string; kind: string; questions: number; responses: number }[];
  pollResponders: number;
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value.toLocaleString()}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </Card>
  );
}

export function AdminAnalytics({ code }: { code: string }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    const res = await fetch(`/api/events/${code}/analytics`, { cache: "no-store" });
    if (res.ok) {
      setData((await res.json()) as Analytics);
      setError(false);
    } else setError(true);
  }, [code]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="text-red-600">Couldn&apos;t load analytics.</p>;
  if (!data) return <Spinner />;
  const engagement = data.participants ? Math.round((data.activeParticipants / data.participants) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Event analytics</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={load}>
            ↻ Refresh
          </Button>
          <a href={`/api/events/${code}/export?type=questions`} className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm font-medium hover:bg-gray-50">
            Export questions (CSV)
          </a>
          <a href={`/api/events/${code}/export?type=polls`} className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm font-medium hover:bg-gray-50">
            Export poll results (CSV)
          </a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Participants" value={data.participants} hint={`${engagement}% asked or voted`} />
        <Stat label="Questions" value={data.questions.total} hint={`${data.questions.answered} answered · ${data.questions.pending} pending`} />
        <Stat label="Question upvotes" value={data.questionVotes} />
        <Stat label="Poll respondents" value={data.pollResponders} />
      </div>

      <Card>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">Poll</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 text-right font-medium">Questions</th>
              <th className="px-4 py-2 text-right font-medium">Responses</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.polls.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                  No polls yet
                </td>
              </tr>
            )}
            {data.polls.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2">{p.title}</td>
                <td className="px-4 py-2 text-gray-600">{p.kind === "QUIZ" ? "Quiz" : p.questions > 1 ? "Survey" : "Poll"}</td>
                <td className="px-4 py-2 text-right tabular-nums">{p.questions}</td>
                <td className="px-4 py-2 text-right tabular-nums">{p.responses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
