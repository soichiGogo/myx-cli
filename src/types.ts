/** A single upcoming calendar event. */
export interface CalEvent {
  start: Date;
  title: string;
  /** Online-meeting URL (Meet/Zoom/Teams) if one was found on the event. */
  meetingUrl?: string;
}

/**
 * Official rate-limit usage, sourced from the Claude Code statusLine stdin JSON
 * (`rate_limits.*`) via the `myx statusline` helper. Percentages are 0..100.
 */
export interface UsageSnapshot {
  fiveHourPct: number | null;
  fiveHourResetAt: number | null; // epoch seconds
  sevenDayPct: number | null;
  sevenDayResetAt: number | null; // epoch seconds
  /** epoch ms when the cache was last written by `myx statusline`. */
  updatedAt: number | null;
  /** True when the cache is missing or older than the freshness window. */
  stale: boolean;
}

/** Everything the renderer needs for one frame. */
export interface WidgetState {
  events: CalEvent[];
  usage: UsageSnapshot;
}
