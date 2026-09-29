"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";
import type { QuestionDTO } from "@/lib/types";
import { Badge, Button, Textarea, cx } from "./ui";

export const MAX_QUESTION_LENGTH = 280;
export type QuestionSort = "popular" | "recent";

export function sortQuestions(questions: QuestionDTO[], sort: QuestionSort): QuestionDTO[] {
  return [...questions].sort((a, b) =>
    sort === "popular"
      ? b.votes - a.votes || b.createdAt.localeCompare(a.createdAt)
      : b.createdAt.localeCompare(a.createdAt),
  );
}

/** Re-renders periodically so relative timestamps stay fresh. */
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function SortToggle({ value, onChange }: { value: QuestionSort; onChange: (s: QuestionSort) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-sm" role="group" aria-label="Sort questions">
      {(["popular", "recent"] as const).map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          aria-pressed={value === s}
          className={cx("rounded-md px-3 py-1 capitalize", value === s ? "bg-white font-medium shadow-sm" : "text-gray-600")}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

export function VoteButton({ votes, voted, onClick, disabled }: { votes: number; voted: boolean; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={voted}
      aria-label={voted ? `Remove upvote (${votes})` : `Upvote (${votes})`}
      className={cx(
        "flex min-w-12 flex-col items-center rounded-lg border px-2 py-1 text-sm transition-colors",
        voted ? "border-brand-600 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600 hover:border-gray-400",
        disabled && "cursor-default hover:border-gray-200",
      )}
    >
      <span aria-hidden>▲</span>
      <span className="font-semibold tabular-nums">{votes}</span>
    </button>
  );
}

export function QuestionMeta({ q, now, highlighted }: { q: QuestionDTO; now: number; highlighted?: boolean }) {
  return (
    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
      <span className="font-medium text-gray-700">{q.authorName ?? "Anonymous"}</span>
      <span>{timeAgo(q.createdAt, now)}</span>
      {highlighted && <Badge tone="blue">On screen</Badge>}
      {q.starred && <Badge tone="amber">★ Starred</Badge>}
      {q.status === "ANSWERED" && <Badge tone="green">Answered</Badge>}
      {q.status === "PENDING" && <Badge tone="amber">Awaiting review</Badge>}
    </div>
  );
}

export function ParticipantQuestion({
  q,
  now,
  voted,
  mine,
  highlighted,
  onVote,
  onEdit,
  onDelete,
}: {
  q: QuestionDTO;
  now: number;
  voted: boolean;
  mine: boolean;
  highlighted: boolean;
  onVote: () => void;
  onEdit: (text: string) => Promise<void>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(q.text);
  return (
    <li className={cx("flex gap-3 rounded-xl border bg-white p-4 animate-pop-in", highlighted ? "border-blue-300 ring-2 ring-blue-100" : "border-gray-200")}>
      <div className="min-w-0 flex-1">
        <QuestionMeta q={q} now={now} highlighted={highlighted} />
        {editing ? (
          <div className="space-y-2">
            <Textarea rows={3} value={draft} maxLength={MAX_QUESTION_LENGTH} onChange={(e) => setDraft(e.target.value)} aria-label="Edit question" />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onEdit(draft).then(() => setEditing(false), () => {})} disabled={!draft.trim()}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words text-[15px] text-gray-900">{q.text}</p>
        )}
        {mine && !editing && q.status === "LIVE" && (
          <div className="mt-2 flex gap-3 text-xs">
            <button className="text-gray-500 hover:text-gray-800" onClick={() => { setDraft(q.text); setEditing(true); }}>
              Edit
            </button>
            <button className="text-gray-500 hover:text-red-600" onClick={onDelete}>
              Delete
            </button>
          </div>
        )}
      </div>
      <VoteButton votes={q.votes} voted={voted} onClick={onVote} disabled={q.status !== "LIVE"} />
    </li>
  );
}
