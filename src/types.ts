/** A single upcoming calendar event. */
export interface CalEvent {
  start: Date;
  title: string;
  /** Online-meeting URL (Meet/Zoom/Teams) if one was found on the event. */
  meetingUrl?: string;
}

/** Snapshot of the current Claude 5-hour usage block. */
export interface UsageSnapshot {
  /** Current usage of the 5h block as a fraction 0..1, or null if unknown. */
  pct: number | null;
  /** Projected usage at reset if the current pace continues (0..1), or null. */
  projectedPct: number | null;
  /** Minutes until the current 5h block resets. */
  resetInMinutes: number;
  /** True when the % is an estimate (uncalibrated / "max"-relative denominator). */
  estimated: boolean;
  /** When projectedPct > 1, estimated minutes until the limit is hit. */
  minutesToLimit?: number;
}

/** Everything the renderer needs for one frame. */
export interface WidgetState {
  events: CalEvent[];
  usage: UsageSnapshot;
  /** True when data is served from a stale cache after a refresh failure. */
  stale?: boolean;
}
