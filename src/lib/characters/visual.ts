/**
 * Character visual frame standard (product lock).
 * All recommended packs and user uploads should match this ratio.
 *
 * @see docs/CHARACTER_VISUAL.md
 */

/** Portrait aspect = width / height → 3:4 vertical half-body */
export const CHARACTER_FRAME_RATIO = 3 / 4;

/** Recommended source asset pixels (3:4) */
export const CHARACTER_ASSET_WIDTH = 768;
export const CHARACTER_ASSET_HEIGHT = 1024;

/** Right rail target width (px) */
export const CHARACTER_RAIL_WIDTH_PX = 320;

/** Hub list thumbnail (logical CSS size; still 3:4) */
export const CHARACTER_HUB_THUMB_WIDTH_PX = 120;

/** CSS aspect-ratio value for frames */
export const CHARACTER_ASPECT_CSS = "3 / 4";

export type PortraitVariant = "hero" | "hub" | "chip";
