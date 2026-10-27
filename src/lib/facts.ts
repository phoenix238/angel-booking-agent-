import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { placesPhrase, pronounWords, type Settings } from "./settings";

export type FactRow = {
  id: string;
  fact: string;
  source: "website" | "interview" | "manual";
  active: boolean;
  created_at: string;
};

export async function getActiveFacts(db: SupabaseClient): Promise<FactRow[]> {
  const { data, error } = await db
    .from("profile_facts")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as FactRow[];
}

export function aboutBlock(facts: Pick<FactRow, "fact">[], st: Settings): string {
  if (facts.length === 0) return "";
  const { obj, poss } = pronounWords(st.client.pronouns);
  const where = `Where ${pronounWords(st.client.pronouns).subj} can work and apply: ${placesPhrase(st.regions.places)}.${st.regions.note ? ` ${st.regions.note}` : ""}`;
  return `About ${st.client.firstName} (from ${poss} website and interviews with ${obj}):\n- ${where}\n${facts.map((f) => `- ${f.fact}`).join("\n")}`;
}
