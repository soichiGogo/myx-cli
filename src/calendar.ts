// node-ical is CommonJS: import the default and destructure, so this works at
// runtime under Node's ESM↔CJS interop (named imports fail to resolve there).
import nodeIcal from "node-ical";
import type { VEvent } from "node-ical";
import type { CalEvent } from "./types.ts";
import { extractMeetingUrl, text } from "./meeting.ts";

const { sync, expandRecurringEvent } = nodeIcal;

/** How far ahead to look so weekly/monthly recurrences are captured. */
const HORIZON_DAYS = 60;

function toCalEvent(start: Date, ev: VEvent, base: VEvent): CalEvent {
  const url = extractMeetingUrl(ev as Record<string, unknown>) ?? extractMeetingUrl(base as Record<string, unknown>);
  const out: CalEvent = {
    start: new Date(start),
    title: text(ev.summary) || text(base.summary) || "(no title)",
  };
  if (url) out.meetingUrl = url;
  return out;
}

/** Parse an iCalendar string and return the next `count` upcoming events. */
export function parseEvents(ics: string, count: number, now: Date): CalEvent[] {
  const data = sync.parseICS(ics);
  const from = now;
  const to = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);
  const events: CalEvent[] = [];

  for (const comp of Object.values(data)) {
    if (!comp || comp.type !== "VEVENT") continue;
    const ev = comp;
    if (ev.status === "CANCELLED") continue;

    if (ev.rrule) {
      try {
        for (const inst of expandRecurringEvent(ev, { from, to })) {
          events.push(toCalEvent(inst.start, inst.event, ev));
        }
      } catch {
        /* skip an event whose recurrence can't be expanded */
      }
    } else if (ev.start) {
      events.push(toCalEvent(ev.start, ev, ev));
    }
  }

  return events
    .filter((e) => e.start.getTime() >= now.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, count);
}

/** Fetch the iCal secret URL and return the next `count` upcoming events. */
export async function fetchEvents(url: string, count: number, now: Date): Promise<CalEvent[]> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`iCal HTTP ${res.status}`);
  return parseEvents(await res.text(), count, now);
}
