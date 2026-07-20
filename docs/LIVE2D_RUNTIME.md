# Live2D runtime boundary

Liora controls characters through semantic commands, not Cubism parameter IDs.
The boundary lives in `src/lib/characters/runtime`.

## Adapter lifecycle

1. App bootstrap registers one `CharacterRuntimeFactory`.
2. `CharacterRuntimeStage` creates an adapter when a character has a
   `live2dPackageUrl`.
3. The adapter receives a canvas and package root, then loads `config/manifest.json`.
4. Product activity is translated to `CharacterCommand`.
5. Resize and disposal are owned by the stage.
6. A static portrait remains visible if no adapter is installed or loading fails.

The Cubism SDK adapter is deliberately absent until its license has been
accepted and the official SDK files are supplied. It should implement only the
interface in `runtime/types.ts`; UI components must not import Cubism directly.

## TTS contract

Audio analysis should send normalized `mouthValue` in the range 0..1. A future
phoneme mapper may additionally drive `mouthForm` inside the adapter. Silence
must explicitly return mouth opening to zero.

