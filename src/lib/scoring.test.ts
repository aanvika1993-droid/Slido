import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";
import { quizScore } from "./scoring";

describe("quizScore", () => {
  it("gives nothing for wrong answers", () => expect(quizScore(false, 10000, 20000)).toBe(0));
  it("rewards speed between 500 and 1000 points", () => {
    expect(quizScore(true, 20000, 20000)).toBe(1000);
    expect(quizScore(true, 10000, 20000)).toBe(750);
    expect(quizScore(true, 0, 20000)).toBe(500);
    expect(quizScore(true, -500, 20000)).toBe(500);
  });
});

describe("csv", () => {
  it("escapes commas, quotes and newlines", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell(null)).toBe("");
    expect(toCsv(["x", "y"], [[1, "a,b"]])).toBe('x,y\r\n1,"a,b"\r\n');
  });
});
