# Character visual frame (locked)

All **recommended packs**, **user uploads**, and **Meta art** share one stage.

## Ratio & assets

| Spec | Value |
|------|--------|
| Aspect ratio | **3:4** (width : height) |
| Preferred source | **768 × 1024** px |
| Acceptable | width 512–1024, keep 3:4 |
| Display | `object-fit: cover`, `object-position: center top` |
| Field | `CharacterCard.avatarUrl` (optional) |

Constants: `src/lib/characters/visual.ts`

## UI sizes

| Stage | Size | Component |
|-------|------|-----------|
| **Hero** (right rail) | full content width ≤ 280px, height from 3:4 | `CharacterPortrait` `variant="hero"` |
| **Hub thumb** | **120 × 160** (3:4) | `variant="hub"` |
| Right rail width | **320px** (narrow layouts ~300px) | `.workspace` grid |

## Meta (Liora)

- Same **3:4** frame as personas.
- Until custom art is provided: **CSS ghost silhouette** (no solid body).
- User-planned art: ethereal / non-corporeal figure; drop into `avatarUrl` later — frame does not change.

## Persona / custom upload (implemented)

1. Character library → New / Edit → **Upload image**.
2. Client cover-crops to **3:4** (top-biased), max **768×1024**, JPEG data URL.
3. Stored on `CharacterCard.avatarUrl` inside `characters.json` (local only).
4. Clear portrait reverts Meta ghost / persona monogram.
5. Recommended packs should still ship PNG/WebP at 768×1024 when online packs land.

Code: `src/lib/characters/avatar.ts`

## Do not

- Use 16:9 as the main character stage.
- Give Meta a different aspect ratio than personas.
- Let description text shrink the portrait (clamp text; portrait stays `aspect-ratio: 3/4`).
