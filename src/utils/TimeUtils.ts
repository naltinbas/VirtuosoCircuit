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

/** performance.now() with a fallback for environments that lack it. */
export function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
