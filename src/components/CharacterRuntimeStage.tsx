import { useEffect, useRef, useState } from "react";
import { commandForActivity } from "../lib/characters/runtime/activity";
import { createCharacterRuntime } from "../lib/characters/runtime/registry";
import type { CharacterRuntime } from "../lib/characters/runtime/types";
import type { CharacterCard } from "../types";
import { CharacterPortrait } from "./CharacterPortrait";

interface Props {
  character: CharacterCard;
  generating: boolean;
  memoryWorking: boolean;
  label?: string;
  alt?: string;
}

/**
 * Stable 3:4 host for static portraits and future Cubism rendering.
 * No SDK code is imported here; an adapter is registered at app bootstrap.
 */
export function CharacterRuntimeStage({
  character,
  generating,
  memoryWorking,
  label,
  alt,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<CharacterRuntime | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !character.live2dPackageUrl) return;

    const runtime = createCharacterRuntime();
    if (!runtime) return;

    runtimeRef.current = runtime;
    let active = true;
    void runtime
      .load({ canvas, packageUrl: character.live2dPackageUrl })
      .then(() => {
        if (active) setLive(true);
      })
      .catch(() => {
        if (active) setLive(false);
      });

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      runtime.resize(bounds.width, bounds.height, window.devicePixelRatio || 1);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    return () => {
      active = false;
      observer.disconnect();
      runtime.dispose();
      runtimeRef.current = null;
      setLive(false);
    };
  }, [character.live2dPackageUrl]);

  useEffect(() => {
    runtimeRef.current?.command(commandForActivity({ generating, memoryWorking }));
  }, [generating, memoryWorking]);

  return (
    <div className="character-runtime-stage" data-live={live || undefined}>
      {!live ? (
        <CharacterPortrait
          character={character}
          variant="hero"
          label={label}
          alt={alt}
        />
      ) : null}
      <canvas
        ref={canvasRef}
        className="character-runtime-canvas"
        aria-label={live ? alt : undefined}
        aria-hidden={!live}
      />
    </div>
  );
}

