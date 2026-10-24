// Pure timing logic for whole-section timed blocks: EMOM, AMRAP and For Time.
// No React, no audio — the player feeds it elapsed whole seconds and acts on
// the events it returns, so the maths can be unit-tested in plain Node.

export type BlockKind = 'emom' | 'amrap' | 'fortime';

export interface BlockConfig {
  kind: BlockKind;
  // EMOM: intervals x intervalSec. AMRAP: the clock. For Time: the cap, or
  // null for an uncapped stopwatch.
  totalSec: number | null;
  // EMOM only: length of one interval (60 for "every minute on the minute").
  intervalSec: number;
}

export type BlockEvent =
  | { type: 'start' }
  | { type: 'interval'; index: number; of: number }   // EMOM: a new minute begins (0-based index)
  | { type: 'countdown'; n: 3 | 2 | 1 }                // 3-2-1 before the next boundary
  | { type: 'halfway' }
  | { type: 'oneMinute' }
  | { type: 'end' };

export function intervalCount(cfg: BlockConfig): number {
  if (cfg.kind !== 'emom' || !cfg.totalSec) return 0;
  return Math.round(cfg.totalSec / cfg.intervalSec);
}

// Seconds from `s` to the next boundary that deserves a 3-2-1: the next
// minute for EMOM, the end of the clock (or cap) otherwise.
function secsToBoundary(cfg: BlockConfig, s: number): number | null {
  if (cfg.kind === 'emom') return cfg.intervalSec - (s % cfg.intervalSec);
  if (cfg.totalSec == null) return null;
  return cfg.totalSec - s;
}

// Events for one whole elapsed second.
export function eventsAt(cfg: BlockConfig, s: number): BlockEvent[] {
  const out: BlockEvent[] = [];
  const total = cfg.totalSec;
  if (total != null && s >= total) return [{ type: 'end' }];
  if (s === 0) out.push({ type: 'start' });
  if (cfg.kind === 'emom' && s % cfg.intervalSec === 0) {
    out.push({ type: 'interval', index: s / cfg.intervalSec, of: intervalCount(cfg) });
  }
  const toB = secsToBoundary(cfg, s);
  if (toB === 3 || toB === 2 || toB === 1) out.push({ type: 'countdown', n: toB });
  if (cfg.kind !== 'emom' && total != null) {
    // Only worth announcing on clocks long enough for it to mean something.
    if (total >= 600 && s === Math.floor(total / 2)) out.push({ type: 'halfway' });
    if (total > 120 && total - s === 60) out.push({ type: 'oneMinute' });
  }
  return out;
}

// Every event for the seconds after `prevSec` up to and including `curSec`.
// prevSec = -1 means "nothing processed yet". A tick that arrives late (the
// phone was busy) still fires each skipped second's events, in order — except
// stale 3-2-1 cues, which would only stack up audio, so only the latest
// countdown in the batch is kept.
export function eventsBetween(cfg: BlockConfig, prevSec: number, curSec: number): BlockEvent[] {
  const out: BlockEvent[] = [];
  for (let s = prevSec + 1; s <= curSec; s++) {
    const ev = eventsAt(cfg, s);
    out.push(...ev);
    if (ev.some(e => e.type === 'end')) break;
  }
  const types = out.map(e => e.type);
  const lastCd = types.lastIndexOf('countdown');
  // A countdown already overtaken by the boundary it was counting to is stale too.
  const overtaken = Math.max(types.lastIndexOf('interval'), types.lastIndexOf('end')) > lastCd;
  // After a long gap (phone locked, app backgrounded) only the latest minute
  // is worth announcing — not every minute that was missed.
  const lastInterval = types.lastIndexOf('interval');
  return out.filter((e, i) =>
    (e.type !== 'countdown' || (i === lastCd && !overtaken)) &&
    (e.type !== 'interval' || i === lastInterval));
}

export interface BlockDisplay {
  // The big number: seconds left in this minute (EMOM), on the clock (AMRAP),
  // or elapsed (For Time).
  mainSec: number;
  // EMOM: 0-based current interval.
  intervalIdx: number;
  intervals: number;
  // Seconds left on the whole block, when it has an end.
  totalLeft: number | null;
}

export function displayAt(cfg: BlockConfig, s: number): BlockDisplay {
  const total = cfg.totalSec;
  const clamped = total != null ? Math.min(s, total) : s;
  const totalLeft = total != null ? Math.max(0, total - clamped) : null;
  if (cfg.kind === 'emom') {
    const intervals = intervalCount(cfg);
    const idx = Math.min(Math.floor(clamped / cfg.intervalSec), Math.max(intervals - 1, 0));
    const inMin = clamped - idx * cfg.intervalSec;
    return { mainSec: Math.max(0, cfg.intervalSec - inMin), intervalIdx: idx, intervals, totalLeft };
  }
  if (cfg.kind === 'amrap') return { mainSec: totalLeft ?? 0, intervalIdx: 0, intervals: 0, totalLeft };
  return { mainSec: clamped, intervalIdx: 0, intervals: 0, totalLeft };
}

export function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Results ───────────────────────────────────────────────────────────────────
export interface BlockResult {
  kind: BlockKind;
  // Same movements = same key, so a Week 6 retest compares with Week 2.
  key: string;
  label: string;
  rounds?: number;          // AMRAP rounds / For Time rounds finished
  extraReps?: number;       // AMRAP reps into the unfinished round
  timeSec?: number;         // For Time finish time (or elapsed when capped)
  capped?: boolean;
  intervalsDone?: number;   // EMOM
  intervalsPlanned?: number;
}

export function blockKey(kind: BlockKind, movementNames: string[]): string {
  return `${kind}:${movementNames.map(n => n.toLowerCase().trim()).join('|')}`;
}

export function formatBlockResult(r: BlockResult): string {
  if (r.kind === 'amrap') {
    const rounds = r.rounds ?? 0;
    return `${rounds} round${rounds === 1 ? '' : 's'}${r.extraReps ? ` + ${r.extraReps} reps` : ''}`;
  }
  if (r.kind === 'fortime') {
    if (r.capped) return `Capped at ${fmtClock(r.timeSec ?? 0)}${r.rounds != null ? ` · ${r.rounds} rds` : ''}`;
    return fmtClock(r.timeSec ?? 0);
  }
  return `${r.intervalsDone ?? 0}/${r.intervalsPlanned ?? 0} min`;
}

// Higher is better for AMRAP and EMOM; for For Time, an uncapped finish beats
// any capped one and faster beats slower. Returns >0 when `a` beats `b`.
export function compareResults(a: BlockResult, b: BlockResult): number {
  if (a.kind === 'amrap') {
    return ((a.rounds ?? 0) - (b.rounds ?? 0)) * 10000 + ((a.extraReps ?? 0) - (b.extraReps ?? 0));
  }
  if (a.kind === 'fortime') {
    if (!!a.capped !== !!b.capped) return a.capped ? -1 : 1;
    if (a.capped) return ((a.rounds ?? 0) - (b.rounds ?? 0)) || ((b.timeSec ?? 0) - (a.timeSec ?? 0));
    return (b.timeSec ?? 0) - (a.timeSec ?? 0);
  }
  return (a.intervalsDone ?? 0) - (b.intervalsDone ?? 0);
}
