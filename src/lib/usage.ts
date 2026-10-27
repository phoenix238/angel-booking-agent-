import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const FEATURE_LABEL: Record<string, string> = {
  scoring: "Scoring notices",
  chat: "Chat with the agent",
  search: "Agent searches",
  producer: "Producer research",
  radar: "Show radar",
  studios: "Studio map",
  recast: "Recast watch",
};

export type FeatureCost = { feature: string; label: string; calls: number; searches: number; cost: number };
export type UsageSummary = {
  month: number;
  lastMonth: number;
  projected: number;
  dayOfMonth: number;
  daysInMonth: number;
  byFeature: FeatureCost[];
};

export async function usageSummary(db: SupabaseClient, now = new Date()): Promise<UsageSummary> {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const monthStart = new Date(Date.UTC(y, m, 1));
  const prevStart = new Date(Date.UTC(y, m - 1, 1));
  const { data } = await db
    .from("usage_log")
    .select("at, feature, cost_usd, searches")
    .gte("at", prevStart.toISOString())
    .limit(50_000);
  let month = 0;
  let lastMonth = 0;
  const by = new Map<string, FeatureCost>();
  for (const r of data ?? []) {
    const cost = Number(r.cost_usd);
    if (new Date(r.at as string) >= monthStart) {
      month += cost;
      const f = by.get(r.feature as string) ?? { feature: r.feature as string, label: FEATURE_LABEL[r.feature as string] ?? (r.feature as string), calls: 0, searches: 0, cost: 0 };
      f.calls++;
      f.searches += Number(r.searches);
      f.cost += cost;
      by.set(f.feature, f);
    } else {
      lastMonth += cost;
    }
  }
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return {
    month,
    lastMonth,
    projected: dayOfMonth >= 3 ? (month / dayOfMonth) * daysInMonth : month,
    dayOfMonth,
    daysInMonth,
    byFeature: [...by.values()].sort((a, b) => b.cost - a.cost),
  };
}
