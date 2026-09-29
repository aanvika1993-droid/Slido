"use client";

import { useState } from "react";
import { QuestionMeta, SortToggle, VoteButton, sortQuestions, useNow, type QuestionSort } from "@/components/Questions";
import { Badge, Button, Card, EmptyState, Switch, Tabs, cx, useToast } from "@/components/ui";
import type { EventRoom } from "@/lib/socket-client";
import type { QuestionDTO, QuestionStatus } from "@/lib/types";

type Filter = "PENDING" | "LIVE" | "ANSWERED" | "REJECTED";

export function AdminQA({ room }: { room: EventRoom }) {
  const toast = useToast();
  const now = useNow();
  const event = room.event!;
  const [sort, setSort] = useState<QuestionSort>("popular");
  const counts = (s: QuestionStatus) => room.questions.filter((q) => q.status === s).length;
  const pending = counts("PENDING");
  const [filter, setFilter] = useState<Filter>(pending ? "PENDING" : "LIVE");

  const run = (name: string, payload: unknown) => room.call(name, payload).catch((err: Error) => toast(err.message, "error"));
  const moderate = (questionId: string, action: string) => run("qa:moderate", { questionId, action });
  const setting = (patch: Record<string, boolean>) => run("event:update", patch);

  const list = sortQuestions(
    room.questions.filter((q) => q.status === filter),
    filter === "LIVE" ? sort : "recent",
  );
  const highlighted = room.questions.find((q) => q.id === event.highlightedQuestionId);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div>
        {highlighted && (
          <Card className="mb-4 border-blue-200 bg-blue-50 p-4">
            <div className="mb-1 flex items-center justify-between">
              <Badge tone="blue">On screen</Badge>
              <Button size="sm" variant="ghost" onClick={() => moderate(highlighted.id, "unhighlight")}>
                Remove from screen
              </Button>
            </div>
            <p className="text-lg font-medium">{highlighted.text}</p>
            <p className="text-sm text-gray-600">
              {highlighted.authorName ?? "Anonymous"} · {highlighted.votes} upvotes
            </p>
          </Card>
        )}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Tabs
            className="border-none"
            value={filter}
            onChange={setFilter}
            tabs={[
              ...(event.qaModeration || pending
                ? [{ id: "PENDING" as const, label: <>Review {pending > 0 && <Badge tone="amber">{pending}</Badge>}</> }]
                : []),
              { id: "LIVE" as const, label: `Live (${counts("LIVE")})` },
              { id: "ANSWERED" as const, label: `Answered (${counts("ANSWERED")})` },
              { id: "REJECTED" as const, label: `Archived (${counts("REJECTED")})` },
            ]}
          />
          {filter === "LIVE" && <SortToggle value={sort} onChange={setSort} />}
        </div>

        {list.length === 0 ? (
          <Card>
            <EmptyState title={filter === "PENDING" ? "Nothing to review" : "No questions here yet"}>
              {filter === "LIVE" && "Questions from your audience will show up here in real time."}
            </EmptyState>
          </Card>
        ) : (
          <ul className="space-y-3">
            {list.map((q) => (
              <AdminQuestion key={q.id} q={q} now={now} highlighted={q.id === event.highlightedQuestionId} onAction={(a) => moderate(q.id, a)} />
            ))}
          </ul>
        )}
      </div>

      <aside className="space-y-4">
        <Card className="space-y-4 p-4">
          <h2 className="text-sm font-semibold text-gray-700">Q&amp;A controls</h2>
          <Switch
            checked={!event.qaPaused}
            onChange={(v) => setting({ qaPaused: !v })}
            label="Accept new questions"
            description="Pause to stop new questions temporarily."
            disabled={!event.qaEnabled}
          />
          <Switch
            checked={event.qaModeration}
            onChange={(v) => setting({ qaModeration: v })}
            label="Moderation"
            description="Review questions before they go live."
            disabled={!event.qaEnabled}
          />
          <Switch
            checked={event.qaAnonymousAllowed}
            onChange={(v) => setting({ qaAnonymousAllowed: v })}
            label="Allow anonymous questions"
            disabled={!event.qaEnabled}
          />
          {!event.qaEnabled && <p className="text-xs text-amber-700">Q&amp;A is turned off. Enable it in Settings.</p>}
        </Card>
      </aside>
    </div>
  );
}

function AdminQuestion({
  q,
  now,
  highlighted,
  onAction,
}: {
  q: QuestionDTO;
  now: number;
  highlighted: boolean;
  onAction: (action: string) => void;
}) {
  const act = (label: string, action: string, variant: "secondary" | "ghost" | "primary" = "ghost") => (
    <Button size="sm" variant={variant} onClick={() => onAction(action)}>
      {label}
    </Button>
  );
  return (
    <li className={cx("flex gap-3 rounded-xl border bg-white p-4", highlighted ? "border-blue-300 ring-2 ring-blue-100" : "border-gray-200")}>
      <VoteButton votes={q.votes} voted={false} disabled />
      <div className="min-w-0 flex-1">
        <QuestionMeta q={q} now={now} highlighted={highlighted} />
        <p className="whitespace-pre-wrap break-words">{q.text}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {q.status === "PENDING" && (
            <>
              {act("Approve", "approve", "primary")}
              {act("Reject", "reject", "secondary")}
            </>
          )}
          {q.status === "LIVE" && (
            <>
              {highlighted ? act("Remove from screen", "unhighlight", "secondary") : act("Highlight", "highlight", "secondary")}
              {act("✓ Mark answered", "answer")}
              {act(q.starred ? "★ Unstar" : "☆ Star", q.starred ? "unstar" : "star")}
              {act("Archive", "reject")}
            </>
          )}
          {q.status === "ANSWERED" && act("Reopen", "unanswer")}
          {q.status === "REJECTED" && act("Restore", "restore")}
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:bg-red-50"
            onClick={() => confirm("Delete this question permanently?") && onAction("delete")}
          >
            Delete
          </Button>
        </div>
      </div>
    </li>
  );
}
