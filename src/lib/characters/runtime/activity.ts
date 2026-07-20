import type { CharacterCommand } from "./types";

export interface CharacterActivity {
  generating: boolean;
  memoryWorking: boolean;
}

/** Map product state to semantic character behavior, never to Cubism parameter IDs. */
export function commandForActivity(activity: CharacterActivity): CharacterCommand {
  if (activity.generating) {
    return {
      emotion: "neutral",
      action: "explain",
      speaking: true,
      intensity: 0.6,
    };
  }

  if (activity.memoryWorking) {
    return {
      emotion: "thinking",
      action: "idle",
      speaking: false,
      intensity: 0.4,
    };
  }

  return {
    emotion: "neutral",
    action: "idle",
    speaking: false,
    mouthValue: 0,
    intensity: 0.2,
  };
}

export function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function clampGaze(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

