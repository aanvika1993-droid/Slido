"use client";

import { useEffect, useState } from "react";
import { PollEditor } from "@/components/PollEditor";
import { Leaderboard, QuestionResults, QuizTimer } from "@/components/PollResults";
import { Badge, Button, Card, EmptyState, Modal, Switch, useToast } from "@/components/ui";
import type { EventRoom } from "@/lib/socket-client";
import { QUESTION_TYPE_LABELS, type LeaderboardEntry, type PollDTO, type PollKind, type PollResultsDTO } from "@/lib/types";

function kindLabel(poll: PollDTO) {
  if (poll.kind === "QUIZ") return "Quiz";
  return poll.questions.length > 1 ? "Survey" : QUESTION_TYPE_LABELS[poll.questions[0]?.type ?? "MULTIPLE_CHOICE"];
}

export function AdminPolls({ room }: { room: EventRoom }) {
  const toast = useToast();
  const [editor, setEditor] = useState<{ kind: PollKind; poll?: PollDTO } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const activeId = room.event!.activePollId;

  const run = (name: string, payload?: unknown) => room.call(name, payload).catch((err: Error) => toast(err.message, "error"));

  const save = async (poll: unknown) => {
    await room.call("poll:save", { pollId: editor?.poll?.id, poll });
    toast(editor?.poll ? "Changes saved" : "Created");
    setEditor(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Polls, surveys &amp; quizzes</h2>
        <div className="flex gap-2">
          <Button onClick={() => setEditor({ kind: "POLL" })}>+ Poll or survey</Button>
          <Button variant="secondary" onClick={() => setEditor({ kind: "QUIZ" })}>
            + Quiz
          </Button>
        </div>
      </div>

      {room.activePoll.poll && <ActivePollPanel room={room} run={run} />}

      {room.polls.length === 0 ? (
        <Card>
          <EmptyState title="No polls yet">Create a poll, survey or quiz, then activate it when you&apos;re ready.</EmptyState>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-gray-100">
            {room.polls.map((poll) => (
              <li key={poll.id} className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{poll.title}</span>
                      <Badge tone={poll.kind === "QUIZ" ? "blue" : "gray"}>{kindLabel(poll)}</Badge>
                      {poll.id === activeId && <Badge tone="green">● Live</Badge>}
                    </div>
                    <p className="text-xs text-gray-500">
                      {poll.questions.length} {poll.questions.length === 1 ? "question" : "questions"} · {poll.respondents ?? 0} responded
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {poll.id === activeId ? (
                      <Button size="sm" variant="secondary" onClick={() => run("poll:deactivate")}>
                        Deactivate
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => run("poll:activate", { pollId: poll.id })}>
                        Activate
                      </Button>
                    )}
                    {poll.id !== activeId && (
                      <Button size="sm" variant="ghost" onClick={() => setExpanded(expanded === poll.id ? null : poll.id)}>
                        {expanded === poll.id ? "Hide results" : "Results"}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setEditor({ kind: poll.kind, poll })}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50"
                      onClick={() => confirm(`Delete "${poll.title}" and its results?`) && run("poll:delete", { pollId: poll.id })}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                {expanded === poll.id && poll.id !== activeId && <StoredResults room={room} poll={poll} />}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        open={!!editor}
        onClose={() => setEditor(null)}
        title={editor?.poll ? `Edit ${editor.kind === "QUIZ" ? "quiz" : "poll"}` : editor?.kind === "QUIZ" ? "New quiz" : "New poll or survey"}
        wide
      >
        {editor && <PollEditor kind={editor.kind} initial={editor.poll} onSave={save} onCancel={() => setEditor(null)} />}
      </Modal>
    </div>
  );
}

function ResultsList({ poll, results }: { poll: PollDTO; results: PollResultsDTO | null }) {
  if (!results) return null;
  return (
    <div className="space-y-6">
      {poll.questions.map((q, i) => (
        <div key={q.id}>
          <h4 className="mb-3 text-sm font-medium">
            {poll.questions.length > 1 && <span className="text-gray-400">Q{i + 1}. </span>}
            {q.text} <span className="text-xs font-normal text-gray-400">({QUESTION_TYPE_LABELS[q.type]})</span>
          </h4>
          <QuestionResults question={q} result={results.questions[q.id]} />
        </div>
      ))}
    </div>
  );
}

function StoredResults({ room, poll }: { room: EventRoom; poll: PollDTO }) {
  const [data, setData] = useState<{ results: PollResultsDTO; leaderboard: LeaderboardEntry[] | null } | null>(null);
  const { call } = room;
  useEffect(() => {
    call<{ results: PollResultsDTO; leaderboard: LeaderboardEntry[] | null }>("poll:results", { pollId: poll.id }).then(setData, () => {});
  }, [call, poll.id, poll.respondents]);
  if (!data) return <p className="mt-3 text-sm text-gray-500">Loading results…</p>;
  return (
    <div className="mt-4 space-y-6 rounded-lg bg-gray-50 p-4">
      <p className="text-xs text-gray-500">{data.results.respondents} respondents</p>
      <ResultsList poll={poll} results={data.results} />
      {data.leaderboard && (
        <div>
          <h4 className="mb-2 text-sm font-medium">Leaderboard</h4>
          <Leaderboard entries={data.leaderboard} />
        </div>
      )}
    </div>
  );
}

function ActivePollPanel({ room, run }: { room: EventRoom; run: (name: string, payload?: unknown) => Promise<unknown> }) {
  const { poll, results, leaderboard } = room.activePoll;
  if (!poll) return null;
  const flags = (patch: Record<string, unknown>) => run("poll:flags", { pollId: poll.id, ...patch });
  const quiz = poll.quiz;

  return (
    <Card className="border-brand-500 p-5 ring-2 ring-brand-100">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Badge tone="green">● Live now</Badge>
            <Badge tone={poll.kind === "QUIZ" ? "blue" : "gray"}>{kindLabel(poll)}</Badge>
          </div>
          <h3 className="mt-2 text-lg font-semibold">{poll.title}</h3>
          <p className="text-sm text-gray-500">
            {results?.respondents ?? 0} {results?.respondents === 1 ? "participant" : "participants"} responded
          </p>
        </div>
        <Button variant="secondary" onClick={() => run("poll:deactivate")}>
          Deactivate
        </Button>
      </div>

      {quiz ? (
        <QuizControls room={room} run={run} />
      ) : (
        <div className="mb-5 grid gap-4 rounded-lg bg-gray-50 p-4 sm:grid-cols-2">
          <Switch checked={poll.resultsVisible} onChange={(v) => flags({ resultsVisible: v })} label="Show results to participants" />
          <Switch checked={poll.votingLocked} onChange={(v) => flags({ votingLocked: v })} label="Lock voting" description="Stop accepting responses" />
          {poll.questions.length > 1 && (
            <div className="flex items-center gap-2 text-sm sm:col-span-2">
              <span className="font-medium">On screen:</span>
              <Button size="sm" variant="secondary" disabled={poll.presentIndex === 0} onClick={() => flags({ presentIndex: poll.presentIndex - 1 })}>
                ←
              </Button>
              <span>
                Question {poll.presentIndex + 1} of {poll.questions.length}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={poll.presentIndex >= poll.questions.length - 1}
                onClick={() => flags({ presentIndex: poll.presentIndex + 1 })}
              >
                →
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <ResultsList poll={poll} results={results} />
        {leaderboard && (
          <div>
            <h4 className="mb-2 text-sm font-medium">Leaderboard</h4>
            <Leaderboard entries={leaderboard} />
          </div>
        )}
      </div>
    </Card>
  );
}

function QuizControls({ room, run }: { room: EventRoom; run: (name: string, payload?: unknown) => Promise<unknown> }) {
  const { poll, results } = room.activePoll;
  const quiz = poll!.quiz!;
  const control = (action: string) => run("quiz:control", { pollId: poll!.id, action });
  const q = poll!.questions[quiz.index];
  const isLast = quiz.index >= poll!.questions.length - 1;
  const answers = q ? (results?.questions[q.id]?.total ?? 0) : 0;

  return (
    <div className="mb-5 space-y-3 rounded-lg bg-blue-50 p-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium">
          {quiz.phase === "LOBBY" && "Waiting to start"}
          {quiz.phase === "QUESTION" && `Question ${quiz.index + 1} of ${poll!.questions.length} is open · ${answers} answers`}
          {quiz.phase === "REVEAL" && `Showing answer for question ${quiz.index + 1}`}
          {quiz.phase === "FINISHED" && "Quiz finished"}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {quiz.phase === "LOBBY" && <Button onClick={() => control("start")}>▶ Start quiz</Button>}
          {quiz.phase === "QUESTION" && <Button onClick={() => control("reveal")}>Reveal answer</Button>}
          {quiz.phase === "REVEAL" && <Button onClick={() => control("next")}>{isLast ? "Show final results" : "Next question →"}</Button>}
          {quiz.phase !== "LOBBY" && (
            <Button variant="ghost" onClick={() => confirm("Restart the quiz? All scores will be cleared.") && control("reset")}>
              Restart
            </Button>
          )}
        </div>
      </div>
      {quiz.phase === "QUESTION" && q && (
        <>
          <p className="font-medium">{q.text}</p>
          <QuizTimer endsAt={quiz.endsAt} clockOffset={room.clockOffset} totalSec={q.timeLimitSec} />
        </>
      )}
    </div>
  );
}
