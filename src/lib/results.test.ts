import { describe, expect, it } from "vitest";
import { aggregateQuestion, buildLeaderboard } from "./results";

const options = [
  { id: "a", text: "A" },
  { id: "b", text: "B" },
  { id: "c", text: "C" },
];

describe("aggregateQuestion", () => {
  it("counts multiple-choice votes, including multi-select", () => {
    const r = aggregateQuestion({ type: "MULTIPLE_CHOICE", ratingMax: 5, options }, [
      { id: "1", value: { optionIds: ["a"] } },
      { id: "2", value: { optionIds: ["a", "b"] } },
    ]);
    expect(r).toEqual({
      type: "choice",
      total: 2,
      options: [
        { id: "a", text: "A", count: 2 },
        { id: "b", text: "B", count: 1 },
        { id: "c", text: "C", count: 0 },
      ],
    });
  });

  it("averages ratings and builds a distribution", () => {
    const r = aggregateQuestion({ type: "RATING", ratingMax: 5, options: [] }, [
      { id: "1", value: { rating: 5 } },
      { id: "2", value: { rating: 4 } },
      { id: "3", value: { rating: 4 } },
    ]);
    expect(r).toMatchObject({ type: "rating", average: 4.3, distribution: [0, 0, 0, 2, 1] });
  });

  it("normalises word-cloud entries and counts each word once per participant", () => {
    const r = aggregateQuestion({ type: "WORD_CLOUD", ratingMax: 5, options: [] }, [
      { id: "1", value: { words: ["Fast", "fast ", "fun"] } },
      { id: "2", value: { words: ["FAST"] } },
    ]);
    expect(r).toMatchObject({ words: [{ text: "fast", count: 2 }, { text: "fun", count: 1 }] });
  });

  it("returns open-text answers newest first", () => {
    const r = aggregateQuestion({ type: "OPEN_TEXT", ratingMax: 5, options: [] }, [
      { id: "1", value: { text: "first" } },
      { id: "2", value: { text: "second" } },
    ]);
    expect(r).toMatchObject({ answers: [{ id: "2" }, { id: "1" }] });
  });

  it("ranks options with a Borda count", () => {
    const r = aggregateQuestion({ type: "RANKING", ratingMax: 5, options }, [
      { id: "1", value: { ranking: ["b", "a", "c"] } },
      { id: "2", value: { ranking: ["b", "c", "a"] } },
    ]);
    expect(r.type === "ranking" && r.options.map((o) => [o.id, o.points, o.averagePosition])).toEqual([
      ["b", 4, 1],
      ["a", 1, 2.5],
      ["c", 1, 2.5],
    ]);
  });
});

describe("buildLeaderboard", () => {
  it("sums scores per participant and shares ranks on ties", () => {
    const board = buildLeaderboard([
      { participantId: "p1", name: "Ana", score: 800 },
      { participantId: "p2", name: null, score: 500 },
      { participantId: "p1", name: "Ana", score: 0 },
      { participantId: "p3", name: "Bo", score: 800 },
    ]);
    expect(board).toEqual([
      { participantId: "p1", name: "Ana", score: 800, rank: 1 },
      { participantId: "p3", name: "Bo", score: 800, rank: 1 },
      { participantId: "p2", name: "Anonymous", score: 500, rank: 3 },
    ]);
  });
});
