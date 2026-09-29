"use client";

import cloud from "d3-cloud";
import { useEffect, useState } from "react";
import { percent } from "@/lib/format";
import type { LeaderboardEntry, PollQuestionDTO, QuestionResult } from "@/lib/types";
import { cx } from "./ui";

type Size = "sm" | "lg";

export function QuestionResults({
  question,
  result,
  size = "sm",
  dark,
}: {
  question: PollQuestionDTO;
  result: QuestionResult | undefined;
  size?: Size;
  dark?: boolean;
}) {
  if (!result) return null;
  switch (result.type) {
    case "choice":
      return <ChoiceResults result={result} size={size} dark={dark} />;
    case "rating":
      return <RatingResults result={result} size={size} dark={dark} />;
    case "words":
      return <WordCloud words={result.words} dark={dark} size={size} />;
    case "text":
      return <TextWall answers={result.answers} size={size} dark={dark} />;
    case "ranking":
      return <RankingResults result={result} size={size} dark={dark} optionCount={question.options.length} />;
  }
}

function Bar({ value, dark, correct }: { value: number; dark?: boolean; correct?: boolean }) {
  return (
    <div className={cx("h-2.5 w-full overflow-hidden rounded-full", dark ? "bg-white/10" : "bg-gray-100")}>
      <div
        className={cx("h-full rounded-full transition-all duration-500", correct === false ? "bg-gray-400" : "bg-brand-500")}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function ChoiceResults({
  result,
  size,
  dark,
}: {
  result: Extract<QuestionResult, { type: "choice" }>;
  size: Size;
  dark?: boolean;
}) {
  return (
    <ul className={cx("space-y-3", size === "lg" && "space-y-5")}>
      {result.options.map((o) => {
        const p = percent(o.count, result.total);
        return (
          <li key={o.id}>
            <div className={cx("mb-1 flex items-baseline justify-between gap-3", size === "lg" ? "text-2xl" : "text-sm")}>
              <span className={cx("font-medium", o.isCorrect && "text-brand-600")}>
                {o.isCorrect && <span aria-label="Correct answer">✓ </span>}
                {o.text}
              </span>
              <span className={cx("tabular-nums", dark ? "text-white/70" : "text-gray-500")}>
                {p}% <span className="text-xs">({o.count})</span>
              </span>
            </div>
            <Bar value={p} dark={dark} correct={o.isCorrect === undefined ? undefined : o.isCorrect} />
          </li>
        );
      })}
    </ul>
  );
}

function RatingResults({
  result,
  size,
  dark,
}: {
  result: Extract<QuestionResult, { type: "rating" }>;
  size: Size;
  dark?: boolean;
}) {
  const max = Math.max(1, ...result.distribution);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-end sm:justify-center sm:gap-10">
      <div className="text-center">
        <div className={cx("font-bold tabular-nums", size === "lg" ? "text-7xl" : "text-4xl")}>
          {result.average.toFixed(1)}
          <span className={cx("font-normal", size === "lg" ? "text-3xl" : "text-lg", dark ? "text-white/60" : "text-gray-400")}>
            {" "}/ {result.max}
          </span>
        </div>
        <div className={cx("text-amber-400", size === "lg" ? "text-3xl" : "text-lg")} aria-hidden>
          {"★".repeat(Math.round(result.average))}
          <span className={dark ? "text-white/20" : "text-gray-200"}>{"★".repeat(result.max - Math.round(result.average))}</span>
        </div>
      </div>
      <div className={cx("flex items-end gap-2", size === "lg" ? "h-48" : "h-24")}>
        {result.distribution.map((count, i) => (
          <div key={i} className="flex h-full flex-col items-center justify-end gap-1">
            <span className={cx("text-xs tabular-nums", dark ? "text-white/60" : "text-gray-500")}>{count}</span>
            <div
              className="w-6 rounded-t bg-brand-500 transition-all duration-500 sm:w-8"
              style={{ height: `${(count / max) * 100}%`, minHeight: 2 }}
            />
            <span className="text-xs font-medium">{i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankingResults({
  result,
  size,
  dark,
  optionCount,
}: {
  result: Extract<QuestionResult, { type: "ranking" }>;
  size: Size;
  dark?: boolean;
  optionCount: number;
}) {
  const maxPoints = Math.max(1, result.total * (optionCount - 1));
  return (
    <ol className={cx("space-y-3", size === "lg" && "space-y-5")}>
      {result.options.map((o, i) => (
        <li key={o.id} className="flex items-center gap-3">
          <span
            className={cx(
              "flex shrink-0 items-center justify-center rounded-full bg-brand-600 font-bold text-white",
              size === "lg" ? "h-12 w-12 text-xl" : "h-7 w-7 text-sm",
            )}
          >
            {i + 1}
          </span>
          <div className="flex-1">
            <div className={cx("mb-1 flex justify-between gap-2", size === "lg" ? "text-2xl" : "text-sm")}>
              <span className="font-medium">{o.text}</span>
              <span className={cx("tabular-nums", dark ? "text-white/60" : "text-gray-500")}>
                {o.averagePosition ? `avg. #${o.averagePosition}` : "—"}
              </span>
            </div>
            <Bar value={(o.points / maxPoints) * 100} dark={dark} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function TextWall({ answers, size, dark }: { answers: { id: string; text: string }[]; size: Size; dark?: boolean }) {
  if (!answers.length) return <p className={dark ? "text-white/60" : "text-gray-500"}>No answers yet.</p>;
  return (
    <ul className={cx("grid gap-3", size === "lg" ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-1 sm:grid-cols-2")}>
      {answers.map((a) => (
        <li
          key={a.id}
          className={cx(
            "animate-pop-in rounded-lg p-3 break-words",
            size === "lg" ? "text-xl" : "text-sm",
            dark ? "bg-white/10" : "bg-gray-50 border border-gray-200",
          )}
        >
          {a.text}
        </li>
      ))}
    </ul>
  );
}

// ---------- Word cloud ----------

const CLOUD_W = 800;
const CLOUD_H = 420;
const CLOUD_COLORS = ["#059669", "#2563eb", "#d97706", "#db2777", "#7c3aed", "#0891b2"];

interface CloudWord extends cloud.Word {
  text: string;
  size: number;
  count: number;
}

function seededRandom(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

export function WordCloud({ words, dark, size = "sm" }: { words: { text: string; count: number }[]; dark?: boolean; size?: Size }) {
  const [placed, setPlaced] = useState<CloudWord[]>([]);
  const key = JSON.stringify(words);

  useEffect(() => {
    const list = JSON.parse(key) as { text: string; count: number }[];
    if (!list.length) {
      setPlaced([]);
      return;
    }
    const max = Math.max(...list.map((w) => w.count));
    let cancelled = false;
    const layout = cloud<CloudWord>()
      .size([CLOUD_W, CLOUD_H])
      .words(list.map((w) => ({ text: w.text, count: w.count, size: 18 + (w.count / max) * 58 })))
      .padding(4)
      .rotate(0)
      .font("system-ui, sans-serif")
      .fontWeight("700")
      .fontSize((d) => d.size)
      .random(seededRandom(42))
      .on("end", (out) => {
        if (!cancelled) setPlaced(out);
      });
    layout.start();
    return () => {
      cancelled = true;
      layout.stop();
    };
  }, [key]);

  if (!words.length) return <p className={dark ? "text-white/60" : "text-gray-500"}>No words yet.</p>;
  return (
    <svg
      viewBox={`0 0 ${CLOUD_W} ${CLOUD_H}`}
      className={cx("w-full", size === "lg" ? "max-h-[60vh]" : "max-h-72")}
      role="img"
      aria-label={`Word cloud: ${words.map((w) => `${w.text} (${w.count})`).join(", ")}`}
    >
      <g transform={`translate(${CLOUD_W / 2},${CLOUD_H / 2})`}>
        {placed.map((w, i) => (
          <text
            key={w.text}
            textAnchor="middle"
            transform={`translate(${w.x},${w.y})`}
            style={{ fontSize: w.size, fontWeight: 700, fontFamily: "system-ui, sans-serif" }}
            fill={CLOUD_COLORS[i % CLOUD_COLORS.length]}
            className="transition-all duration-500"
          >
            <title>{`${w.text}: ${w.count}`}</title>
            {w.text}
          </text>
        ))}
      </g>
    </svg>
  );
}

// ---------- Quiz ----------

export function useCountdown(endsAt: string | null, clockOffset: number) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!endsAt) {
      setRemaining(0);
      return;
    }
    const end = Date.parse(endsAt);
    const tick = () => setRemaining(Math.max(0, end - (Date.now() + clockOffset)));
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [endsAt, clockOffset]);
  return remaining;
}

export function QuizTimer({
  endsAt,
  clockOffset,
  totalSec,
  dark,
  size = "sm",
}: {
  endsAt: string | null;
  clockOffset: number;
  totalSec: number;
  dark?: boolean;
  size?: Size;
}) {
  const remaining = useCountdown(endsAt, clockOffset);
  const fraction = totalSec ? remaining / (totalSec * 1000) : 0;
  return (
    <div className="flex items-center gap-3" aria-live="off">
      <div className={cx("h-2 flex-1 overflow-hidden rounded-full", dark ? "bg-white/10" : "bg-gray-200")}>
        <div
          className={cx("h-full rounded-full transition-[width] duration-200 ease-linear", fraction < 0.25 ? "bg-red-500" : "bg-brand-500")}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <span className={cx("w-12 text-right font-bold tabular-nums", size === "lg" ? "text-4xl w-20" : "text-lg")}>
        {Math.ceil(remaining / 1000)}s
      </span>
    </div>
  );
}

export function Leaderboard({
  entries,
  meId,
  dark,
  size = "sm",
}: {
  entries: LeaderboardEntry[];
  meId?: string;
  dark?: boolean;
  size?: Size;
}) {
  if (!entries.length) return <p className={dark ? "text-white/60" : "text-gray-500"}>No scores yet.</p>;
  return (
    <ol className={cx("space-y-2", size === "lg" && "space-y-3")}>
      {entries.map((e) => (
        <li
          key={e.participantId}
          className={cx(
            "flex items-center gap-3 rounded-lg px-3 py-2",
            size === "lg" ? "text-2xl" : "text-sm",
            e.participantId === meId
              ? "bg-brand-100 text-brand-700 font-semibold"
              : dark
                ? "bg-white/10"
                : "bg-gray-50",
          )}
        >
          <span className="w-8 font-bold tabular-nums">{e.rank <= 3 ? ["🥇", "🥈", "🥉"][e.rank - 1] : `#${e.rank}`}</span>
          <span className="flex-1 truncate">{e.name}</span>
          <span className="font-semibold tabular-nums">{e.score.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}
