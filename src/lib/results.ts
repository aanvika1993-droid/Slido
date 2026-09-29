import type {
  LeaderboardEntry,
  PollQuestionType,
  QuestionResult,
  ResponseValue,
} from "./types";

export interface AggregatableQuestion {
  type: PollQuestionType;
  ratingMax: number;
  options: { id: string; text: string; isCorrect?: boolean }[];
}

export interface AggregatableResponse {
  id: string;
  value: ResponseValue;
}

const MAX_TEXT_ANSWERS = 200;
const MAX_WORDS = 80;

export function normalizeWord(word: string): string {
  return word.trim().replace(/\s+/g, " ").toLowerCase();
}

export function aggregateQuestion(
  question: AggregatableQuestion,
  responses: AggregatableResponse[],
): QuestionResult {
  const total = responses.length;
  switch (question.type) {
    case "MULTIPLE_CHOICE":
    case "QUIZ": {
      const counts = new Map<string, number>();
      for (const r of responses) {
        if (!("optionIds" in r.value)) continue;
        for (const id of r.value.optionIds) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      return {
        type: "choice",
        total,
        options: question.options.map((o) => ({
          id: o.id,
          text: o.text,
          count: counts.get(o.id) ?? 0,
          ...(o.isCorrect !== undefined ? { isCorrect: o.isCorrect } : {}),
        })),
      };
    }
    case "RATING": {
      const distribution = Array.from({ length: question.ratingMax }, () => 0);
      let sum = 0;
      let n = 0;
      for (const r of responses) {
        if (!("rating" in r.value)) continue;
        const rating = r.value.rating;
        if (rating < 1 || rating > question.ratingMax) continue;
        distribution[rating - 1]++;
        sum += rating;
        n++;
      }
      return {
        type: "rating",
        total,
        max: question.ratingMax,
        distribution,
        average: n ? Math.round((sum / n) * 10) / 10 : 0,
      };
    }
    case "WORD_CLOUD": {
      const counts = new Map<string, number>();
      for (const r of responses) {
        if (!("words" in r.value)) continue;
        // Count each word once per participant.
        for (const w of new Set(r.value.words.map(normalizeWord).filter(Boolean))) {
          counts.set(w, (counts.get(w) ?? 0) + 1);
        }
      }
      const words = [...counts.entries()]
        .map(([text, count]) => ({ text, count }))
        .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
        .slice(0, MAX_WORDS);
      return { type: "words", total, words };
    }
    case "OPEN_TEXT": {
      const answers = responses
        .filter((r): r is { id: string; value: { text: string } } => "text" in r.value)
        .slice(-MAX_TEXT_ANSWERS)
        .reverse()
        .map((r) => ({ id: r.id, text: r.value.text }));
      return { type: "text", total, answers };
    }
    case "RANKING": {
      // Borda count: first place earns n-1 points, last place earns 0.
      const n = question.options.length;
      const points = new Map<string, number>();
      const positions = new Map<string, number[]>();
      for (const r of responses) {
        if (!("ranking" in r.value)) continue;
        r.value.ranking.forEach((id, i) => {
          points.set(id, (points.get(id) ?? 0) + (n - 1 - i));
          positions.set(id, [...(positions.get(id) ?? []), i + 1]);
        });
      }
      const options = question.options
        .map((o) => {
          const pos = positions.get(o.id) ?? [];
          return {
            id: o.id,
            text: o.text,
            points: points.get(o.id) ?? 0,
            averagePosition: pos.length
              ? Math.round((pos.reduce((a, b) => a + b, 0) / pos.length) * 10) / 10
              : 0,
          };
        })
        .sort((a, b) => b.points - a.points);
      return { type: "ranking", total, options };
    }
  }
}

export function buildLeaderboard(
  scores: { participantId: string; name: string | null; score: number }[],
  limit = 10,
): LeaderboardEntry[] {
  const totals = new Map<string, { name: string | null; score: number }>();
  for (const s of scores) {
    const t = totals.get(s.participantId) ?? { name: s.name, score: 0 };
    t.score += s.score;
    totals.set(s.participantId, t);
  }
  const sorted = [...totals.entries()]
    .map(([participantId, t]) => ({ participantId, name: t.name || "Anonymous", score: t.score }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const ranked: LeaderboardEntry[] = [];
  sorted.forEach((e, i) => {
    const rank = i > 0 && sorted[i - 1].score === e.score ? ranked[i - 1].rank : i + 1;
    ranked.push({ ...e, rank });
  });
  return ranked.slice(0, limit);
}
