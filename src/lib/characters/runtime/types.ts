export const CHARACTER_EMOTIONS = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "surprised",
  "thinking",
] as const;

export const CHARACTER_ACTIONS = [
  "idle",
  "greet",
  "agree",
  "disagree",
  "explain",
  "goodbye",
] as const;

export type CharacterEmotion = (typeof CHARACTER_EMOTIONS)[number];
export type CharacterAction = (typeof CHARACTER_ACTIONS)[number];

export interface CharacterCommand {
  emotion?: CharacterEmotion;
  action?: CharacterAction;
  speaking?: boolean;
  mouthValue?: number;
  gaze?: { x: number; y: number };
  intensity?: number;
}

export interface CharacterRuntimeHost {
  canvas: HTMLCanvasElement;
  packageUrl: string;
}

/** SDK-independent boundary. Cubism, a game engine bridge, or a test double can implement it. */
export interface CharacterRuntime {
  load(host: CharacterRuntimeHost): Promise<void>;
  command(command: CharacterCommand): void;
  resize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
}

export type CharacterRuntimeFactory = () => CharacterRuntime;

