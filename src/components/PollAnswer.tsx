"use client";

import { useState } from "react";
import type { PollQuestionDTO, ResponseValue } from "@/lib/types";
import { Button, Input, Textarea, cx } from "./ui";

const QUIZ_COLORS = ["bg-rose-500", "bg-sky-500", "bg-amber-500", "bg-emerald-500", "bg-violet-500", "bg-orange-500"];

export function PollAnswer({
  question,
  onSubmit,
  disabled,
  submitLabel = "Send",
}: {
  question: PollQuestionDTO;
  onSubmit: (value: ResponseValue) => Promise<void>;
  disabled?: boolean;
  submitLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const submit = async (value: ResponseValue) => {
    setBusy(true);
    try {
      await onSubmit(value);
    } finally {
      setBusy(false);
    }
  };
  const props = { question, submit, disabled: disabled || busy, submitLabel };

  switch (question.type) {
    case "MULTIPLE_CHOICE":
      return <ChoiceAnswer {...props} />;
    case "QUIZ":
      return <QuizAnswer {...props} />;
    case "RATING":
      return <RatingAnswer {...props} />;
    case "WORD_CLOUD":
      return <WordsAnswer {...props} />;
    case "OPEN_TEXT":
      return <TextAnswer {...props} />;
    case "RANKING":
      return <RankingAnswer {...props} />;
  }
}

interface AnswerProps {
  question: PollQuestionDTO;
  submit: (value: ResponseValue) => Promise<void>;
  disabled: boolean;
  submitLabel: string;
}

function ChoiceAnswer({ question, submit, disabled, submitLabel }: AnswerProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) =>
    setSelected((s) => (question.allowMultiple ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id]));
  return (
    <div className="space-y-2">
      {question.allowMultiple && <p className="text-xs text-gray-500">Select all that apply</p>}
      {question.options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => toggle(o.id)}
            aria-pressed={on}
            className={cx(
              "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors",
              on ? "border-brand-600 bg-brand-50" : "border-gray-300 bg-white hover:border-gray-400",
            )}
          >
            <span
              className={cx(
                "flex h-5 w-5 shrink-0 items-center justify-center border-2 text-xs text-white",
                question.allowMultiple ? "rounded" : "rounded-full",
                on ? "border-brand-600 bg-brand-600" : "border-gray-400",
              )}
            >
              {on && "✓"}
            </span>
            {o.text}
          </button>
        );
      })}
      <Button className="mt-2 w-full" disabled={disabled || !selected.length} onClick={() => submit({ optionIds: selected })}>
        {submitLabel}
      </Button>
    </div>
  );
}

function QuizAnswer({ question, submit, disabled }: AnswerProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {question.options.map((o, i) => (
        <button
          key={o.id}
          type="button"
          disabled={disabled}
          onClick={() => submit({ optionIds: [o.id] })}
          className={cx(
            "min-h-16 rounded-xl px-4 py-4 text-left text-base font-semibold text-white shadow-sm transition-transform active:scale-[0.98] disabled:opacity-60",
            QUIZ_COLORS[i % QUIZ_COLORS.length],
          )}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}

function RatingAnswer({ question, submit, disabled, submitLabel }: AnswerProps) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  return (
    <div className="space-y-4 text-center">
      <div className="flex justify-center gap-1" onMouseLeave={() => setHover(0)}>
        {Array.from({ length: question.ratingMax }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} of ${question.ratingMax}`}
            aria-pressed={rating === n}
            onMouseEnter={() => setHover(n)}
            onClick={() => setRating(n)}
            className={cx("text-4xl transition-transform hover:scale-110", n <= (hover || rating) ? "text-amber-400" : "text-gray-300")}
          >
            ★
          </button>
        ))}
      </div>
      <Button className="w-full" disabled={disabled || !rating} onClick={() => submit({ rating })}>
        {submitLabel}
      </Button>
    </div>
  );
}

function WordsAnswer({ question, submit, disabled, submitLabel }: AnswerProps) {
  const [words, setWords] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const add = () => {
    const w = draft.trim();
    if (w && words.length < 3 && !words.includes(w)) setWords([...words, w]);
    setDraft("");
  };
  const all = draft.trim() && words.length < 3 ? [...words, draft.trim()] : words;
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={draft}
          maxLength={40}
          placeholder={words.length >= 3 ? "Up to 3 words" : "Type a word and press Enter"}
          disabled={words.length >= 3}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          aria-label={question.text}
        />
        <Button variant="secondary" onClick={add} disabled={!draft.trim() || words.length >= 3}>
          Add
        </Button>
      </div>
      {words.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {words.map((w) => (
            <span key={w} className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-3 py-1 text-sm text-brand-700">
              {w}
              <button aria-label={`Remove ${w}`} onClick={() => setWords(words.filter((x) => x !== w))}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <Button className="w-full" disabled={disabled || !all.length} onClick={() => submit({ words: all })}>
        {submitLabel}
      </Button>
    </div>
  );
}

function TextAnswer({ question, submit, disabled, submitLabel }: AnswerProps) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-3">
      <Textarea rows={4} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your answer" aria-label={question.text} />
      <div className="text-right text-xs text-gray-400">{text.length}/500</div>
      <Button className="w-full" disabled={disabled || !text.trim()} onClick={() => submit({ text })}>
        {submitLabel}
      </Button>
    </div>
  );
}

function RankingAnswer({ question, submit, disabled, submitLabel }: AnswerProps) {
  const [order, setOrder] = useState(question.options.map((o) => o.id));
  const byId = new Map(question.options.map((o) => [o.id, o.text]));
  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">Put the options in order, with your top choice first.</p>
      <ol className="space-y-2">
        {order.map((id, i) => (
          <li key={id} className="flex items-center gap-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{i + 1}</span>
            <span className="flex-1">{byId.get(id)}</span>
            <button className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${byId.get(id)} up`}>
              ↑
            </button>
            <button className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-30" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${byId.get(id)} down`}>
              ↓
            </button>
          </li>
        ))}
      </ol>
      <Button className="mt-2 w-full" disabled={disabled} onClick={() => submit({ ranking: order })}>
        {submitLabel}
      </Button>
    </div>
  );
}
