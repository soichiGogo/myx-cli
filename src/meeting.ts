/** Unwrap node-ical's ParameterValue (string or `{ val, params }`) to plain text. */
export function text(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "val" in v) return String((v as { val?: unknown }).val ?? "");
  return "";
}

const URL_RE = /https?:\/\/[^\s<>"')]+/g;

const PROVIDERS = [
  /meet\.google\.com/i,
  /zoom\.us\/(j|my|w)\//i,
  /teams\.microsoft\.com/i,
  /teams\.live\.com/i,
  /webex\.com/i,
];

function clean(u: string): string {
  return u.replace(/[.,;)]+$/, "");
}

/**
 * Best-effort online-meeting URL for a VEVENT. Prefers a known provider (Meet /
 * Zoom / Teams / Webex) found in the conference property, location, or description;
 * otherwise falls back to the first link.
 */
export function extractMeetingUrl(ev: Record<string, unknown>): string | undefined {
  for (const k of ["GOOGLE-CONFERENCE", "X-GOOGLE-CONFERENCE", "google-conference"]) {
    const c = text(ev[k]);
    if (/^https?:\/\//.test(c)) return clean(c);
  }
  const urls = `${text(ev.location)}\n${text(ev.description)}\n${text(ev.url)}`.match(URL_RE) ?? [];
  if (urls.length === 0) return undefined;
  for (const re of PROVIDERS) {
    const hit = urls.find((u) => re.test(u));
    if (hit) return clean(hit);
  }
  return clean(urls[0]!);
}
