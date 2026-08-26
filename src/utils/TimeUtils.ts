/** "1:23" style clock text from milliseconds. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** "+24 ms" / "-41 ms" style offset text. Uses a plain hyphen-minus. */
export function formatOffset(ms: number): string {
  const r = Math.round(ms);
  const sign = r > 0 ? "+" : r < 0 ? "-" : "";
  return `${sign}${Math.abs(r)} ms`;
}

export function formatPercent(v: number, digits = 1): string {
  return `${v.toFixed(digits)}%`;
}

export function formatScore(v: number): string {
  return Math.round(v).toLocaleString("en-US");
}

/**
 * performance.now() with a fallback for environments that lack it. Only
 * AudioEngine and the renderer's idle backdrop may call this; everything else
 * takes times as parameters so the audio clock stays authoritative.
 */
export function perfNowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Rolling average of real frame times for the performance overlay. A sample
 * longer than maxSampleMs is a gap where the page was not rendering at all (a
 * hidden tab, a resume), which is not a frame time, so it is dropped rather
 * than folded into the average for the next forty frames.
 */
export function frameTimeAverage(averageMs: number, sampleMs: number, maxSampleMs: number): number {
  if (!(sampleMs > 0) || sampleMs > maxSampleMs) return averageMs;
  return averageMs * 0.9 + sampleMs * 0.1;
}
