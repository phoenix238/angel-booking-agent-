// Application tracker stages, in board order. Values match the application_status enum.

export const STATUSES = [
  { value: "to_look_at", label: "To look at" },
  { value: "want_to_apply", label: "Want to apply" },
  { value: "applied", label: "Applied" },
  { value: "audition_booked", label: "Audition booked" },
  { value: "recall", label: "Recall" },
  { value: "offer", label: "Offer" },
  { value: "not_this_time", label: "Not this time" },
  { value: "not_for_me", label: "Not for me" },
] as const;

export type Status = (typeof STATUSES)[number]["value"];

export const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.value, s.label])) as Record<Status, string>;

// Columns on the tracker board. "To look at" lives on Matches; "Not for me" is hidden.
export const BOARD_COLUMNS: Status[] = ["want_to_apply", "applied", "audition_booked", "recall", "offer", "not_this_time"];

export function isStatus(v: unknown): v is Status {
  return STATUSES.some((s) => s.value === v);
}

export function daysUntil(isoDate: string, now = new Date()): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const [y, m, d] = isoDate.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000);
}

export function deadlineLabel(isoDate: string): string {
  const n = daysUntil(isoDate);
  const date = new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (n < 0) return `Closed ${date}`;
  if (n === 0) return `Closes today`;
  if (n === 1) return `Closes tomorrow`;
  if (n <= 7) return `Closes in ${n} days (${date})`;
  return `Closes ${date}`;
}

// Neutral date label for events that are not deadlines (e.g. a programme launch).
export function eventDateLabel(isoDate: string): string {
  const n = daysUntil(isoDate);
  const date = new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  if (n < 0) return `${date} (passed)`;
  if (n === 0) return `${date} (today)`;
  if (n === 1) return `${date} (tomorrow)`;
  return `${date} (in ${n} days)`;
}
