import { describe, expect, it } from "vitest";
import { clampGaze, clampUnit, commandForActivity } from "./activity";

describe("character activity mapping", () => {
  it("prioritizes speaking over background memory work", () => {
    expect(commandForActivity({ generating: true, memoryWorking: true })).toMatchObject({
      action: "explain",
      speaking: true,
    });
  });

  it("uses thinking while memory work is active", () => {
    expect(commandForActivity({ generating: false, memoryWorking: true })).toMatchObject({
      emotion: "thinking",
      speaking: false,
    });
  });

  it("clamps normalized inputs", () => {
    expect(clampUnit(2)).toBe(1);
    expect(clampUnit(-1)).toBe(0);
    expect(clampGaze(4)).toBe(1);
    expect(clampGaze(-4)).toBe(-1);
  });
});

