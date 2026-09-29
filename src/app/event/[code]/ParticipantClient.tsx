"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Leaderboard, QuestionResults, QuizTimer, useCountdown } from "@/components/PollResults";
import { PollAnswer } from "@/components/PollAnswer";
import {
  MAX_QUESTION_LENGTH,
  ParticipantQuestion,
  SortToggle,
  sortQuestions,
  useNow,
  type QuestionSort,
} from "@/components/Questions";
import { Badge, Button, Card, EmptyState, Input, Modal, Spinner, Tabs, Textarea, useToast } from "@/components/ui";
import { useEventRoom, type EventRoom } from "@/lib/socket-client";
import type { PollDTO, ResponseValue } from "@/lib/types";

export function ParticipantClient({ code }: { code: string }) {
  const room = useEventRoom(code, "participant");
  const [tab, setTab] = useState<"qa" | "polls">("qa");
  const [nameOpen, setNameOpen] = useState(false);
  const activeId = room.activePoll.poll?.id;
  const lastActive = useRef<string | undefined>(undefined);

  // Jump to the Polls tab whenever the host opens a new poll.
  useEffect(() => {
    if (activeId && activeId !== lastActive.current) setTab("polls");
    lastActive.current = activeId;
  }, [activeId]);

  if (room.status === "connecting") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (room.status === "error" || !room.event || !room.me) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-semibold">Can&apos;t join this event</h1>
        <p className="mt-2 text-gray-600">{room.error ?? "Something went wrong."}</p>
        <Link href="/" className="mt-6 inline-block font-medium text-brand-700 hover:underline">
          ← Try another code
        </Link>
      </div>
    );
  }

  const { event, me } = room;
  const showQa = event.qaEnabled;
  const current = showQa ? tab : "polls";

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 px-4 pt-3 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{event.name}</h1>
            <p className="text-xs text-gray-500">
              #{event.code}
              {!room.connected && <span className="ml-2 text-amber-600">Reconnecting…</span>}
            </p>
          </div>
          <button
            onClick={() => setNameOpen(true)}
            className="flex shrink-0 items-center gap-2 rounded-full border border-gray-200 py-1 pl-1 pr-3 text-sm hover:bg-gray-50"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
              {(me.name ?? "?").slice(0, 1).toUpperCase()}
            </span>
            {me.name ?? "Add your name"}
          </button>
        </div>
        <Tabs
          className="mt-2 border-none"
          value={current}
          onChange={setTab}
          tabs={[
            ...(showQa ? [{ id: "qa" as const, label: "Q&A" }] : []),
            {
              id: "polls" as const,
              label: (
                <span className="flex items-center gap-1.5">
                  Polls {activeId && <span className="h-2 w-2 rounded-full bg-brand-500" aria-label="Active poll" />}
                </span>
              ),
            },
          ]}
        />
      </header>

      <main className="px-4 py-4">
        {event.archived && (
          <p className="mb-4 rounded-lg bg-gray-100 p-3 text-sm text-gray-700">This event has ended. You can still browse it.</p>
        )}
        {current === "qa" ? <ParticipantQA room={room} onNeedName={() => setNameOpen(true)} /> : <ParticipantPolls room={room} onNeedName={() => setNameOpen(true)} />}
      </main>

      <NameDialog room={room} open={nameOpen} onClose={() => setNameOpen(false)} />
    </div>
  );
}

function NameDialog({ room, open, onClose }: { room: EventRoom; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(room.me?.name ?? "");
  useEffect(() => {
    if (open) setName(room.me?.name ?? "");
  }, [open, room.me?.name]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await room.call<{ name: string | null }>("participant:rename", { name });
      room.setMe((m) => (m ? { ...m, name: res.name } : m));
      onClose();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Your name">
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-gray-600">Shown next to your questions and on quiz leaderboards. Leave empty to stay anonymous.</p>
        <Input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Q&A ----------

function ParticipantQA({ room, onNeedName }: { room: EventRoom; onNeedName: () => void }) {
  const toast = useToast();
  const now = useNow();
  const event = room.event!;
  const me = room.me!;
  const [text, setText] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<QuestionSort>("popular");
  const [showAnswered, setShowAnswered] = useState(false);

  const voted = useMemo(() => new Set(me.votedQuestionIds), [me.votedQuestionIds]);
  const live = sortQuestions(room.questions.filter((q) => q.status === "LIVE"), sort);
  const answered = sortQuestions(room.questions.filter((q) => q.status === "ANSWERED"), "recent");
  const canAsk = !event.qaPaused && !event.archived;
  const askAnonymously = !me.name || anonymous;
  const needsName = askAnonymously && !event.qaAnonymousAllowed;

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (needsName) return onNeedName();
    setBusy(true);
    try {
      const res = await room.call<{ status: string }>("qa:ask", { text, anonymous: askAnonymously });
      setText("");
      toast(res.status === "PENDING" ? "Thanks! Your question will appear once the host approves it." : "Question sent");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const vote = async (id: string) => {
    const had = voted.has(id);
    const apply = (on: boolean) =>
      room.setMe((m) =>
        m ? { ...m, votedQuestionIds: on ? [...m.votedQuestionIds.filter((x) => x !== id), id] : m.votedQuestionIds.filter((x) => x !== id) } : m,
      );
    apply(!had);
    try {
      const res = await room.call<{ voted: boolean }>("qa:vote", { questionId: id });
      apply(res.voted);
    } catch (err) {
      apply(had);
      toast((err as Error).message, "error");
    }
  };

  const edit = async (questionId: string, newText: string) => {
    try {
      await room.call("qa:edit", { questionId, text: newText });
    } catch (err) {
      toast((err as Error).message, "error");
      throw err;
    }
  };
  const remove = async (questionId: string) => {
    if (!confirm("Delete your question?")) return;
    try {
      await room.call("qa:delete", { questionId });
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const renderList = (list: typeof live) => (
    <ul className="space-y-3">
      {list.map((q) => (
        <ParticipantQuestion
          key={q.id}
          q={q}
          now={now}
          voted={voted.has(q.id)}
          mine={q.authorId === me.id}
          highlighted={event.highlightedQuestionId === q.id}
          onVote={() => vote(q.id)}
          onEdit={(t) => edit(q.id, t)}
          onDelete={() => remove(q.id)}
        />
      ))}
    </ul>
  );

  return (
    <div className="space-y-5">
      <Card className="p-4">
        {canAsk ? (
          <form onSubmit={ask} className="space-y-3">
            <Textarea
              rows={3}
              value={text}
              maxLength={MAX_QUESTION_LENGTH}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type your question"
              aria-label="Your question"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-gray-500">
                {me.name ? (
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={anonymous} disabled={!event.qaAnonymousAllowed} onChange={(e) => setAnonymous(e.target.checked)} className="accent-emerald-600" />
                    Ask anonymously
                  </label>
                ) : event.qaAnonymousAllowed ? (
                  <span>
                    Asking anonymously ·{" "}
                    <button type="button" className="text-brand-700 hover:underline" onClick={onNeedName}>
                      add your name
                    </button>
                  </span>
                ) : (
                  <button type="button" className="text-brand-700 hover:underline" onClick={onNeedName}>
                    Add your name to ask a question
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs tabular-nums text-gray-400">{MAX_QUESTION_LENGTH - text.length}</span>
                <Button type="submit" disabled={busy || !text.trim()}>
                  Send
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <p className="text-center text-sm text-gray-600">
            {event.archived ? "This event has ended." : "The host has paused new questions for now."}
          </p>
        )}
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">{live.length} {live.length === 1 ? "question" : "questions"}</h2>
        <SortToggle value={sort} onChange={setSort} />
      </div>
      {live.length ? renderList(live) : <EmptyState title="No questions yet">Be the first to ask one!</EmptyState>}

      {answered.length > 0 && (
        <div>
          <button className="text-sm font-medium text-gray-600 hover:text-gray-900" onClick={() => setShowAnswered((v) => !v)}>
            {showAnswered ? "▾" : "▸"} Answered ({answered.length})
          </button>
          {showAnswered && <div className="mt-3">{renderList(answered)}</div>}
        </div>
      )}
    </div>
  );
}

// ---------- Polls ----------

function ParticipantPolls({ room, onNeedName }: { room: EventRoom; onNeedName: () => void }) {
  const { poll } = room.activePoll;
  if (!poll) {
    return <EmptyState title="No active poll right now">When the host opens a poll, it will appear here automatically.</EmptyState>;
  }
  const key = poll.id + poll.questions.map((q) => q.id).join();
  return poll.kind === "QUIZ" ? (
    <QuizFlow key={poll.id} room={room} poll={poll} onNeedName={onNeedName} />
  ) : (
    <SurveyFlow key={key} room={room} poll={poll} />
  );
}

function SurveyFlow({ room, poll }: { room: EventRoom; poll: PollDTO }) {
  const toast = useToast();
  const answered = new Set(room.me!.answeredPollQuestionIds);
  const firstOpen = poll.questions.findIndex((q) => !answered.has(q.id));
  const [index, setIndex] = useState(firstOpen === -1 ? poll.questions.length : firstOpen);
  const { results } = room.activePoll;
  const done = index >= poll.questions.length;
  const isSurvey = poll.questions.length > 1;

  const submit = async (value: ResponseValue) => {
    const q = poll.questions[index];
    try {
      await room.call("poll:respond", { pollQuestionId: q.id, value });
      room.setMe((m) => (m ? { ...m, answeredPollQuestionIds: [...m.answeredPollQuestionIds, q.id] } : m));
      setIndex((i) => i + 1);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const resultsBlock = results && (
    <div className="space-y-6">
      {poll.questions.map((q) => (
        <div key={q.id}>
          {isSurvey && <h3 className="mb-3 font-medium">{q.text}</h3>}
          <QuestionResults question={q} result={results.questions[q.id]} />
        </div>
      ))}
      <p className="text-xs text-gray-500">
        {results.respondents} {results.respondents === 1 ? "participant" : "participants"} responded
      </p>
    </div>
  );

  if (poll.votingLocked || done) {
    return (
      <Card className="space-y-5 p-5">
        <div>
          <h2 className="text-lg font-semibold">{isSurvey ? poll.title : poll.questions[0].text}</h2>
          <p className="mt-1 text-sm text-gray-600">
            {poll.votingLocked ? "Voting is closed." : "✓ Thanks for voting!"}
            {!resultsBlock && " Results will appear here if the host shares them."}
          </p>
        </div>
        {resultsBlock}
        {!poll.votingLocked && (
          <Button variant="secondary" size="sm" onClick={() => setIndex(0)}>
            Change {isSurvey ? "answers" : "answer"}
          </Button>
        )}
      </Card>
    );
  }

  const q = poll.questions[index];
  return (
    <Card className="p-5">
      {isSurvey && (
        <div className="mb-4">
          <div className="mb-1 flex justify-between text-xs text-gray-500">
            <span className="font-medium text-gray-700">{poll.title}</span>
            <span>
              {index + 1} of {poll.questions.length}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${(index / poll.questions.length) * 100}%` }} />
          </div>
        </div>
      )}
      <h2 className="mb-4 text-lg font-semibold">{q.text}</h2>
      <PollAnswer key={q.id} question={q} onSubmit={submit} submitLabel={isSurvey && index < poll.questions.length - 1 ? "Next" : "Send"} />
      {isSurvey && index > 0 && (
        <button className="mt-3 text-sm text-gray-500 hover:text-gray-800" onClick={() => setIndex(index - 1)}>
          ← Back
        </button>
      )}
    </Card>
  );
}

function QuizFlow({ room, poll, onNeedName }: { room: EventRoom; poll: PollDTO; onNeedName: () => void }) {
  const toast = useToast();
  const quiz = poll.quiz!;
  const me = room.me!;
  const quizMe = room.quizMe?.pollId === poll.id ? room.quizMe : null;
  const [justAnswered, setJustAnswered] = useState<string | null>(null);
  const remaining = useCountdown(quiz.phase === "QUESTION" ? quiz.endsAt : null, room.clockOffset);
  const q = poll.questions[quiz.index];
  const answeredThis = !!q && (justAnswered === q.id || !!quizMe?.answered.includes(q.id));

  const submit = async (value: ResponseValue) => {
    try {
      await room.call("poll:respond", { pollQuestionId: q.id, value });
      setJustAnswered(q.id);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const standing = quizMe && quizMe.rank !== null && (
    <p className="text-sm text-gray-600">
      Your score: <strong>{quizMe.total.toLocaleString()}</strong> · rank #{quizMe.rank} of {quizMe.players}
    </p>
  );

  if (quiz.phase === "LOBBY") {
    return (
      <Card className="space-y-4 p-6 text-center">
        <Badge tone="blue">Quiz</Badge>
        <h2 className="text-xl font-semibold">{poll.title}</h2>
        <p className="text-gray-600">Get ready! The quiz starts when the host is ready.</p>
        {!me.name && (
          <Button variant="secondary" onClick={onNeedName}>
            Add your name for the leaderboard
          </Button>
        )}
        {me.name && <p className="text-sm text-gray-500">Playing as <strong>{me.name}</strong></p>}
      </Card>
    );
  }

  if (quiz.phase === "FINISHED") {
    return (
      <Card className="space-y-4 p-5">
        <h2 className="text-center text-xl font-semibold">🏁 Quiz finished</h2>
        {quizMe && quizMe.rank !== null ? (
          <p className="text-center text-gray-700">
            You finished <strong>#{quizMe.rank}</strong> of {quizMe.players} with <strong>{quizMe.total.toLocaleString()}</strong> points.
          </p>
        ) : (
          <p className="text-center text-gray-600">You didn&apos;t play this time.</p>
        )}
        <Leaderboard entries={room.activePoll.leaderboard ?? []} meId={me.id} />
      </Card>
    );
  }

  if (!q) return null;
  const header = (
    <div className="mb-3 flex items-center justify-between text-xs text-gray-500">
      <span>
        Question {quiz.index + 1} of {poll.questionCount}
      </span>
      <span>{poll.title}</span>
    </div>
  );

  if (quiz.phase === "QUESTION") {
    return (
      <Card className="p-5">
        {header}
        <h2 className="mb-3 text-lg font-semibold">{q.text}</h2>
        <div className="mb-4">
          <QuizTimer endsAt={quiz.endsAt} clockOffset={room.clockOffset} totalSec={q.timeLimitSec} />
        </div>
        {answeredThis ? (
          <p className="rounded-lg bg-brand-50 p-4 text-center font-medium text-brand-700">Answer locked in! Waiting for the results…</p>
        ) : remaining <= 0 ? (
          <p className="rounded-lg bg-gray-100 p-4 text-center font-medium text-gray-700">⏰ Time&apos;s up!</p>
        ) : (
          <PollAnswer question={q} onSubmit={submit} />
        )}
      </Card>
    );
  }

  // REVEAL
  const result = room.activePoll.results?.questions[q.id];
  const lastScore = quizMe?.answered.includes(q.id) ? (quizMe.lastScore ?? 0) : null;
  return (
    <Card className="space-y-5 p-5">
      {header}
      <div
        className={
          lastScore === null
            ? "rounded-lg bg-gray-100 p-4 text-center text-gray-700"
            : lastScore > 0
              ? "rounded-lg bg-brand-50 p-4 text-center text-brand-700"
              : "rounded-lg bg-red-50 p-4 text-center text-red-700"
        }
      >
        <p className="text-lg font-semibold">{lastScore === null ? "You didn't answer" : lastScore > 0 ? `Correct! +${lastScore}` : "Not this time"}</p>
        {standing}
      </div>
      <div>
        <h2 className="mb-3 font-semibold">{q.text}</h2>
        <QuestionResults question={q} result={result} />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Leaderboard</h3>
        <Leaderboard entries={room.activePoll.leaderboard ?? []} meId={me.id} />
      </div>
    </Card>
  );
}
