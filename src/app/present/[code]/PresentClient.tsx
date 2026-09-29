"use client";

import { JoinQr, useJoinUrl } from "@/components/JoinInfo";
import { Leaderboard, QuestionResults, QuizTimer } from "@/components/PollResults";
import { sortQuestions } from "@/components/Questions";
import { Spinner, cx } from "@/components/ui";
import { useEventRoom, type EventRoom } from "@/lib/socket-client";

const QUIZ_COLORS = ["bg-rose-500", "bg-sky-500", "bg-amber-500", "bg-emerald-500", "bg-violet-500", "bg-orange-500"];

export function PresentClient({ code }: { code: string }) {
  const room = useEventRoom(code, "present");
  const { host } = useJoinUrl(code);

  if (room.status !== "ready" || !room.event) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
        {room.error ? <p>{room.error}</p> : <Spinner />}
      </div>
    );
  }
  const { event } = room;
  const highlighted = room.questions.find((q) => q.id === event.highlightedQuestionId);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  let content: React.ReactNode;
  if (room.activePoll.poll) content = <PresentPoll room={room} />;
  else if (highlighted) {
    content = (
      <div className="mx-auto flex h-full max-w-5xl flex-col justify-center animate-pop-in">
        <p className="mb-6 text-2xl text-white/60">{highlighted.authorName ?? "Anonymous"} asks</p>
        <p className="text-5xl leading-tight font-semibold lg:text-6xl">{highlighted.text}</p>
        <p className="mt-8 text-2xl text-brand-500">▲ {highlighted.votes}</p>
      </div>
    );
  } else {
    const top = sortQuestions(room.questions.filter((q) => q.status === "LIVE"), "popular").slice(0, 6);
    content = top.length ? (
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-6 text-2xl font-semibold text-white/70">Top questions</h2>
        <ul className="space-y-4">
          {top.map((q) => (
            <li key={q.id} className="flex items-center gap-6 rounded-2xl bg-white/5 p-6 animate-pop-in">
              <span className="w-16 shrink-0 text-center text-2xl font-bold text-brand-500">▲ {q.votes}</span>
              <div className="min-w-0">
                <p className="text-2xl">{q.text}</p>
                <p className="mt-1 text-lg text-white/50">{q.authorName ?? "Anonymous"}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    ) : (
      <div className="flex h-full flex-col items-center justify-center gap-8 text-center">
        <p className="text-3xl text-white/70">Join at <span className="font-semibold text-white">{host}/event</span></p>
        <p className="text-8xl font-bold tracking-widest">#{event.code}</p>
        <JoinQr code={code} size={220} />
        <p className="text-2xl text-white/60">{event.qaEnabled ? "Ask your questions and vote on others" : "Get ready to vote"}</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-gray-950 text-white">
      <header className="flex items-center gap-6 border-b border-white/10 px-8 py-4">
        <div className="flex items-center gap-4">
          <JoinQr code={code} size={64} />
          <div>
            <p className="text-lg text-white/60">
              Join at <span className="font-medium text-white">{host}/event</span>
            </p>
            <p className="text-4xl font-bold tracking-wider">#{event.code}</p>
          </div>
        </div>
        <p className="ml-auto truncate text-xl text-white/70">{event.name}</p>
        <button onClick={toggleFullscreen} className="rounded-lg px-3 py-2 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Toggle full screen" title="Full screen">
          ⛶
        </button>
      </header>
      <main className="flex-1 overflow-y-auto px-8 py-10">{content}</main>
      {!room.connected && <div className="bg-amber-600 px-4 py-1 text-center text-sm">Reconnecting…</div>}
    </div>
  );
}

function PresentPoll({ room }: { room: EventRoom }) {
  const { poll, results, leaderboard } = room.activePoll;
  if (!poll) return null;

  if (poll.quiz) {
    const { quiz } = poll;
    const q = poll.questions[quiz.index];
    if (quiz.phase === "LOBBY") {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
          <p className="text-3xl text-white/60">Quiz</p>
          <h1 className="text-6xl font-bold">{poll.title}</h1>
          <p className="text-2xl text-white/60">{poll.questions.length} questions · Join now and get ready!</p>
        </div>
      );
    }
    if (quiz.phase === "FINISHED") {
      return (
        <div className="mx-auto max-w-3xl">
          <h1 className="mb-8 text-center text-5xl font-bold">🏆 Final leaderboard</h1>
          <Leaderboard entries={leaderboard ?? []} dark size="lg" />
        </div>
      );
    }
    if (!q) return null;
    const result = results?.questions[q.id];
    return (
      <div className="mx-auto max-w-6xl">
        <p className="mb-2 text-xl text-white/60">
          Question {quiz.index + 1} of {poll.questions.length}
        </p>
        <h1 className="mb-6 text-5xl leading-tight font-semibold">{q.text}</h1>
        {quiz.phase === "QUESTION" ? (
          <>
            <div className="mb-8">
              <QuizTimer endsAt={quiz.endsAt} clockOffset={room.clockOffset} totalSec={q.timeLimitSec} dark size="lg" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              {q.options.map((o, i) => (
                <div key={o.id} className={cx("rounded-2xl px-8 py-8 text-3xl font-semibold", QUIZ_COLORS[i % QUIZ_COLORS.length])}>
                  {o.text}
                </div>
              ))}
            </div>
            <p className="mt-8 text-center text-2xl text-white/60">{result?.total ?? 0} answers</p>
          </>
        ) : (
          <div className="grid gap-10 lg:grid-cols-[3fr_2fr]">
            <QuestionResults question={q} result={result} size="lg" dark />
            <div>
              <h2 className="mb-4 text-2xl font-semibold text-white/70">Leaderboard</h2>
              <Leaderboard entries={(leaderboard ?? []).slice(0, 5)} dark size="lg" />
            </div>
          </div>
        )}
      </div>
    );
  }

  const index = Math.min(poll.presentIndex, poll.questions.length - 1);
  const q = poll.questions[index];
  const result = results?.questions[q.id];
  return (
    <div className="mx-auto max-w-6xl">
      {poll.questions.length > 1 && (
        <p className="mb-2 text-xl text-white/60">
          {poll.title} · Question {index + 1} of {poll.questions.length}
        </p>
      )}
      <h1 className="mb-10 text-5xl leading-tight font-semibold">{q.text}</h1>
      <QuestionResults question={q} result={result} size="lg" dark />
      <p className="mt-10 text-xl text-white/50">
        {result?.total ?? 0} {result?.total === 1 ? "response" : "responses"}
        {poll.votingLocked && " · Voting closed"}
      </p>
    </div>
  );
}
