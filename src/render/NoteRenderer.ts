// Signal gems, hold ribbons, chord links and trill links.
//
// Draw order inside the frame: ribbons, then the links that join notes of one
// event or phrase, then the gems, then the debug ids. Heads are grouped by
// lane so the fill and stroke colors are set five times per frame instead of
// once per gem; depth order is kept inside each lane, and lanes only overlap
// in the last few percent before the vanishing point where gems are tiny.

import { LANE_IDENTITIES, LAYOUT } from "../app/Config";
import { LANES } from "../charts/ChartTypes";
import type { NoteState } from "../gameplay/NoteScheduler";
import type { RenderFrame } from "./GameRenderer";
import {
  beatPulseScale,
  laneCenterAtProgress,
  laneWidthAtProgress,
  noteProgress,
  noteScaleAtProgress,
  yAtProgress,
} from "./Geometry";
import { SCENE, clearGlow, laneColor, pathLaneSymbol, setGlow, type Palette, type ViewMetrics } from "./Theme";

/** Gem radius at the gate, as a fraction of the receptor. */
const NOTE_SIZE = 0.9;
/** Half width of a hold ribbon, as a fraction of the lane width at that depth. */
const RIBBON_WIDTH = 0.17;
/** Alpha of a note the practice loop skipped over. */
const SKIPPED_ALPHA = 0.35;
const TRILL_PREFIX = "trill-";

function headVisible(state: NoteState): boolean {
  return state === "pending" || state === "skipped" || state === "holding";
}

function ribbonVisible(state: NoteState): boolean {
  return state === "pending" || state === "skipped" || state === "holding" || state === "holdDropped";
}

export class NoteRenderer {
  /** Visible-note indices per lane, reused every frame. */
  private readonly laneBuckets: number[][] = LANES.map(() => []);
  private readonly laneCounts = new Int32Array(LANES.length);

  draw(ctx: CanvasRenderingContext2D, m: ViewMetrics, pal: Palette, frame: RenderFrame): void {
    this.drawRibbons(ctx, m, pal, frame);
    this.drawChordLinks(ctx, m, pal, frame);
    this.drawTrillLinks(ctx, m, frame);
    this.drawHeads(ctx, m, pal, frame);
    ctx.globalAlpha = 1;
  }

  private drawRibbons(ctx: CanvasRenderingContext2D, m: ViewMetrics, pal: Palette, frame: RenderFrame): void {
    const { layout } = m;
    for (let i = 0; i < frame.noteCount; i++) {
      const view = frame.notes[i];
      const note = view.note;
      if (!note.isHold || note.durationMs <= 0 || !ribbonVisible(view.state)) continue;
      const holding = view.state === "holding";
      const dropped = view.state === "holdDropped";
      const head = noteProgress(note.timeMs, frame.displayMs, frame.approachMs);
      const tail = noteProgress(note.timeMs + note.durationMs, frame.displayMs, frame.approachMs);
      // A held or dropped ribbon is consumed at the gate; a pending one is not.
      const start = Math.max(holding || dropped ? 0 : head, -LAYOUT.pastGateFraction);
      // Longer than the approach window means the tail is cut at the spawn edge.
      const end = Math.min(tail, 1);
      if (end <= start) continue;

      const xStart = laneCenterAtProgress(layout, note.lane, start);
      const xEnd = laneCenterAtProgress(layout, note.lane, end);
      const yStart = yAtProgress(layout, start);
      const yEnd = yAtProgress(layout, end);
      const wStart = laneWidthAtProgress(layout, start) * RIBBON_WIDTH;
      const wEnd = laneWidthAtProgress(layout, end) * RIBBON_WIDTH;

      ctx.fillStyle = dropped ? pal.textMuted : laneColor(note.lane, frame.highContrast);
      ctx.globalAlpha = dropped ? 0.3 : view.state === "skipped" ? SKIPPED_ALPHA * 0.6 : holding ? 0.85 : 0.5;
      setGlow(ctx, pal, pal.laneEdgeLit, holding ? 14 : 0);
      ctx.beginPath();
      ctx.moveTo(xStart - wStart, yStart);
      ctx.lineTo(xEnd - wEnd, yEnd);
      ctx.lineTo(xEnd + wEnd, yEnd);
      ctx.lineTo(xStart + wStart, yStart);
      ctx.closePath();
      ctx.fill();
      clearGlow(ctx);

      if (holding) {
        ctx.strokeStyle = pal.gateCore;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.65;
        ctx.beginPath();
        ctx.moveTo(xStart, yStart);
        ctx.lineTo(xEnd, yEnd);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Notes of one event arrive next to each other in the visible list (the
   * scheduler sorts by time then lane), so one scan finds every chord.
   */
  private drawChordLinks(ctx: CanvasRenderingContext2D, m: ViewMetrics, pal: Palette, frame: RenderFrame): void {
    const { layout } = m;
    let i = 0;
    while (i < frame.noteCount) {
      const first = frame.notes[i];
      let end = i + 1;
      while (end < frame.noteCount && frame.notes[end].note.eventId === first.note.eventId) end++;
      const size = end - i;
      i = end;
      if (size < 2 || !headVisible(first.state)) continue;

      const progress = noteProgress(first.note.timeMs, frame.displayMs, frame.approachMs);
      if (progress < -LAYOUT.pastGateFraction || progress > 1) continue;
      const last = frame.notes[end - 1];
      const y = yAtProgress(layout, progress);
      const xa = laneCenterAtProgress(layout, first.note.lane, progress);
      const xb = laneCenterAtProgress(layout, last.note.lane, progress);
      const left = Math.min(xa, xb);
      const right = Math.max(xa, xb);
      const gem = layout.receptorRadius * NOTE_SIZE * noteScaleAtProgress(progress);
      const alpha = first.state === "skipped" ? SKIPPED_ALPHA * 0.5 : 1;

      ctx.fillStyle = pal.chordBar;
      ctx.globalAlpha = 0.18 * alpha;
      ctx.fillRect(left, y - gem * 0.16, right - left, gem * 0.32);

      ctx.strokeStyle = pal.chordBar;
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.16 * alpha;
      ctx.beginPath();
      ctx.ellipse((left + right) / 2, y, (right - left) / 2 + gem * 1.2, gem * 1.35, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Thin zigzag between consecutive notes of a trill phrase, with a slow shimmer. */
  private drawTrillLinks(ctx: CanvasRenderingContext2D, m: ViewMetrics, frame: RenderFrame): void {
    const { layout } = m;
    const shimmer = frame.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(frame.displayMs / 90);
    ctx.lineWidth = 1.4;
    for (let i = 1; i < frame.noteCount; i++) {
      const far = frame.notes[i - 1];
      const near = frame.notes[i];
      const phraseId = near.note.phraseId;
      if (phraseId === undefined || phraseId !== far.note.phraseId) continue;
      if (!phraseId.startsWith(TRILL_PREFIX)) continue;
      const gap = far.note.timeMs - near.note.timeMs;
      if (gap <= 0 || gap > frame.approachMs * 0.25) continue;
      if (!headVisible(near.state) && !headVisible(far.state)) continue;

      const pNear = noteProgress(near.note.timeMs, frame.displayMs, frame.approachMs);
      const pFar = noteProgress(far.note.timeMs, frame.displayMs, frame.approachMs);
      const pMid = (pNear + pFar) / 2;
      const xNear = laneCenterAtProgress(layout, near.note.lane, pNear);
      const xFar = laneCenterAtProgress(layout, far.note.lane, pFar);
      // Kink the link away from the pair, alternating with the note index so a
      // run of trill notes reads as a zigzag rather than a straight rail.
      const side = near.note.index % 2 === 0 ? 1 : -1;
      const xMid = (xNear + xFar) / 2 + side * laneWidthAtProgress(layout, pMid) * 0.3;

      ctx.strokeStyle = laneColor(near.note.lane, frame.highContrast);
      ctx.globalAlpha = 0.3 + 0.3 * shimmer;
      ctx.beginPath();
      ctx.moveTo(xNear, yAtProgress(layout, pNear));
      ctx.lineTo(xMid, yAtProgress(layout, pMid));
      ctx.lineTo(xFar, yAtProgress(layout, pFar));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawHeads(ctx: CanvasRenderingContext2D, m: ViewMetrics, pal: Palette, frame: RenderFrame): void {
    const { layout } = m;
    const counts = this.laneCounts;
    counts.fill(0);
    for (let i = 0; i < frame.noteCount; i++) {
      const view = frame.notes[i];
      if (!headVisible(view.state)) continue;
      const lane = view.note.lane;
      this.laneBuckets[lane][counts[lane]] = i;
      counts[lane]++;
    }

    const pulse = beatPulseScale(frame.beatPhase, frame.reducedMotion ? 0 : SCENE.beatPulseAmount);
    const glowBlur = pal.glow ? 12 : 0;
    for (const lane of LANES) {
      const count = counts[lane];
      if (count === 0) continue;
      const bucket = this.laneBuckets[lane];
      const symbol = LANE_IDENTITIES[lane].symbol;
      const color = laneColor(lane, frame.highContrast);
      ctx.fillStyle = color;
      ctx.strokeStyle = pal.noteOutline;
      ctx.lineWidth = pal.outlineWidth;

      for (let k = 0; k < count; k++) {
        const view = frame.notes[bucket[k]];
        const note = view.note;
        const raw = noteProgress(note.timeMs, frame.displayMs, frame.approachMs);
        const progress = view.state === "holding" ? Math.max(raw, 0) : raw;
        if (progress < -LAYOUT.pastGateFraction || progress > 1) continue;
        const skipped = view.state === "skipped";
        const size = layout.receptorRadius * NOTE_SIZE * noteScaleAtProgress(progress) * pulse;
        const x = laneCenterAtProgress(layout, lane, progress);
        const y = yAtProgress(layout, progress);

        ctx.globalAlpha = skipped ? SKIPPED_ALPHA : 1;
        setGlow(ctx, pal, color, skipped ? 0 : glowBlur);
        pathLaneSymbol(ctx, symbol, x, y, size);
        ctx.fill();
        clearGlow(ctx);
        ctx.stroke();

        // The lane symbol again, smaller, as the glyph inside the gem.
        ctx.lineWidth = pal.outlineWidth * 0.8;
        pathLaneSymbol(ctx, symbol, x, y, size * 0.44);
        ctx.stroke();
        ctx.lineWidth = pal.outlineWidth;

        if (note.accent && !skipped) {
          ctx.strokeStyle = pal.accentRim;
          ctx.globalAlpha = 0.9;
          ctx.lineWidth = pal.outlineWidth * 1.2;
          pathLaneSymbol(ctx, symbol, x, y, size * 1.22);
          ctx.stroke();
          ctx.strokeStyle = pal.noteOutline;
          ctx.lineWidth = pal.outlineWidth;
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}
