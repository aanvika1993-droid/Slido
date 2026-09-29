"use client";

import { useState } from "react";
import { QUESTION_TYPE_LABELS, type PollDTO, type PollKind, type PollQuestionType } from "@/lib/types";
import { Button, Input, Switch, cx } from "./ui";

interface DraftOption {
  text: string;
  isCorrect: boolean;
}
interface DraftQuestion {
  key: number;
  type: PollQuestionType;
  text: string;
  allowMultiple: boolean;
  ratingMax: number;
  timeLimitSec: number;
  options: DraftOption[];
}

const POLL_TYPES: PollQuestionType[] = ["MULTIPLE_CHOICE", "WORD_CLOUD", "RATING", "OPEN_TEXT", "RANKING"];
const OPTION_TYPES: PollQuestionType[] = ["MULTIPLE_CHOICE", "RANKING", "QUIZ"];
let nextKey = 1;

function blankQuestion(kind: PollKind): DraftQuestion {
  return {
    key: nextKey++,
    type: kind === "QUIZ" ? "QUIZ" : "MULTIPLE_CHOICE",
    text: "",
    allowMultiple: false,
    ratingMax: 5,
    timeLimitSec: 20,
    options: [
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
    ],
  };
}

function fromPoll(poll: PollDTO): DraftQuestion[] {
  return poll.questions.map((q) => ({
    key: nextKey++,
    type: q.type,
    text: q.text,
    allowMultiple: q.allowMultiple,
    ratingMax: q.ratingMax,
    timeLimitSec: q.timeLimitSec,
    options: q.options.length
      ? q.options.map((o) => ({ text: o.text, isCorrect: !!o.isCorrect }))
      : blankQuestion(poll.kind).options,
  }));
}

export function PollEditor({
  kind,
  initial,
  onSave,
  onCancel,
}: {
  kind: PollKind;
  initial?: PollDTO;
  onSave: (poll: unknown) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [questions, setQuestions] = useState<DraftQuestion[]>(() => (initial ? fromPoll(initial) : [blankQuestion(kind)]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: number, patch: Partial<DraftQuestion>) =>
    setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  const updateOption = (key: number, i: number, patch: Partial<DraftOption>) =>
    setQuestions((qs) =>
      qs.map((q) => {
        if (q.key !== key) return q;
        const options = q.options.map((o, j) => {
          if (j === i) return { ...o, ...patch };
          // Quiz questions have a single correct answer.
          return patch.isCorrect && q.type === "QUIZ" ? { ...o, isCorrect: false } : o;
        });
        return { ...q, options };
      }),
    );

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave({
        title: title.trim() || undefined,
        kind,
        questions: questions.map((q) => ({
          type: q.type,
          text: q.text,
          allowMultiple: q.allowMultiple,
          ratingMax: q.ratingMax,
          timeLimitSec: q.timeLimitSec,
          options: OPTION_TYPES.includes(q.type) ? q.options.filter((o) => o.text.trim()) : [],
        })),
      });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const hasResponses = (initial?.respondents ?? 0) > 0;

  return (
    <div className="space-y-5">
      {(questions.length > 1 || kind === "QUIZ") && (
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{kind === "QUIZ" ? "Quiz title" : "Survey title"}</span>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "QUIZ" ? "e.g. Product trivia" : "e.g. Session feedback"} maxLength={200} />
        </label>
      )}

      {questions.map((q, qi) => (
        <div key={q.key} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-500">Q{qi + 1}</span>
            {kind === "POLL" ? (
              <select
                value={q.type}
                onChange={(e) => update(q.key, { type: e.target.value as PollQuestionType })}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                aria-label="Question type"
              >
                {POLL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {QUESTION_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            ) : (
              <label className="flex items-center gap-2 text-sm">
                Time limit
                <select
                  value={q.timeLimitSec}
                  onChange={(e) => update(q.key, { timeLimitSec: Number(e.target.value) })}
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                >
                  {[10, 15, 20, 30, 45, 60, 90].map((s) => (
                    <option key={s} value={s}>
                      {s}s
                    </option>
                  ))}
                </select>
              </label>
            )}
            {questions.length > 1 && (
              <button
                className="ml-auto text-sm text-gray-500 hover:text-red-600"
                onClick={() => setQuestions((qs) => qs.filter((x) => x.key !== q.key))}
              >
                Remove
              </button>
            )}
          </div>

          <Input value={q.text} onChange={(e) => update(q.key, { text: e.target.value })} placeholder="What would you like to ask?" maxLength={300} aria-label={`Question ${qi + 1}`} />

          {OPTION_TYPES.includes(q.type) && (
            <div className="mt-3 space-y-2">
              {q.options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  {q.type === "QUIZ" && (
                    <input
                      type="radio"
                      name={`correct-${q.key}`}
                      checked={o.isCorrect}
                      onChange={() => updateOption(q.key, i, { isCorrect: true })}
                      aria-label={`Mark option ${i + 1} correct`}
                      className="h-4 w-4 accent-emerald-600"
                    />
                  )}
                  <Input value={o.text} onChange={(e) => updateOption(q.key, i, { text: e.target.value })} placeholder={`Option ${i + 1}`} maxLength={200} />
                  <button
                    className="px-2 text-gray-400 hover:text-red-600 disabled:opacity-30"
                    disabled={q.options.length <= 2}
                    onClick={() => update(q.key, { options: q.options.filter((_, j) => j !== i) })}
                    aria-label={`Remove option ${i + 1}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {q.options.length < 12 && (
                <button
                  className="text-sm font-medium text-brand-700 hover:underline"
                  onClick={() => update(q.key, { options: [...q.options, { text: "", isCorrect: false }] })}
                >
                  + Add option
                </button>
              )}
              {q.type === "QUIZ" && <p className="text-xs text-gray-500">Select the radio button next to the correct answer.</p>}
              {q.type === "MULTIPLE_CHOICE" && (
                <div className="pt-2">
                  <Switch checked={q.allowMultiple} onChange={(v) => update(q.key, { allowMultiple: v })} label="Allow multiple answers" />
                </div>
              )}
            </div>
          )}

          {q.type === "RATING" && (
            <label className="mt-3 flex items-center gap-2 text-sm">
              Scale 1 to
              <select
                value={q.ratingMax}
                onChange={(e) => update(q.key, { ratingMax: Number(e.target.value) })}
                className="rounded-md border border-gray-300 bg-white px-2 py-1"
              >
                {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          )}
          {q.type === "WORD_CLOUD" && <p className="mt-2 text-xs text-gray-500">Participants can submit up to 3 words.</p>}
        </div>
      ))}

      <button
        className={cx("w-full rounded-lg border-2 border-dashed border-gray-300 py-2 text-sm font-medium text-gray-600 hover:border-brand-500 hover:text-brand-700")}
        onClick={() => setQuestions((qs) => [...qs, blankQuestion(kind)])}
      >
        + Add another question{kind === "POLL" && questions.length === 1 ? " (makes this a survey)" : ""}
      </button>

      {hasResponses && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          This poll already has responses. Saving changes will reset its results.
        </p>
      )}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy}>
          {initial ? "Save changes" : kind === "QUIZ" ? "Create quiz" : "Create poll"}
        </Button>
      </div>
    </div>
  );
}
