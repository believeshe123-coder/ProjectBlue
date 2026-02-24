export const ERASE_MODES = Object.freeze(["line", "fill"]);

export function normalizeEraseMode(mode, fallback = "line") {
  return ERASE_MODES.includes(mode) ? mode : fallback;
}
