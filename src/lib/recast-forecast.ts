// Pure date maths for the Recast Clock. No server imports, so it can be tested directly.
// The next window is worked out here from dated history; the model never supplies it.

export type CastChange = { date: string; note: string; url: string };
export type Forecast = {
  from: string;
  to: string;
  confidence: "low" | "medium" | "high";
  basis: string;
};

const DAY = 86_400_000;
const WINDOW_DAYS = 28; // the window is the forecast date plus or minus four weeks

const toMs = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// history: past cast-change announcement dates (YYYY-MM-DD). today: YYYY-MM-DD.
// contractMonths: typical contract length if known (0 or null if not).
export function forecastRecast(history: CastChange[], contractMonths: number | null, today: string): Forecast | null {
  const dates = [...new Set(history.map((h) => h.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today))].sort();
  let intervalDays: number | null = null;
  let basis = "";
  let confidence: Forecast["confidence"] = "low";

  if (dates.length >= 2) {
    const gaps = dates.slice(1).map((d, i) => (toMs(d) - toMs(dates[i])) / DAY).filter((g) => g >= 30);
    if (gaps.length) {
      intervalDays = Math.round(median(gaps));
      confidence = gaps.length >= 3 ? "high" : gaps.length === 2 ? "medium" : "low";
      basis = `${dates.length} cast changes found, about every ${Math.round(intervalDays / 30.4)} months`;
    }
  }
  if (intervalDays === null && contractMonths && contractMonths > 0) {
    intervalDays = Math.round(contractMonths * 30.4);
    confidence = "low";
    basis = `typical contract length of ${contractMonths} months`;
  }
  if (intervalDays === null || intervalDays < 30) return null;

  const last = dates.length ? toMs(dates[dates.length - 1]) : null;
  if (last === null) return null; // nothing to count from
  let next = last + intervalDays * DAY;
  // If that window has already passed, project the cycle forward.
  let steps = 0;
  while (next + WINDOW_DAYS * DAY < toMs(today) && steps < 24) {
    next += intervalDays * DAY;
    steps++;
  }
  if (steps > 0) basis += " (projected forward)";
  return { from: toIso(next - WINDOW_DAYS * DAY), to: toIso(next + WINDOW_DAYS * DAY), confidence, basis };
}
