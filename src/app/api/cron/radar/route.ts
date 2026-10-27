import { NextResponse, type NextRequest } from "next/server";
import { runIfAuto } from "@/lib/routine";
import { loadSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

// Weekly check (vercel.json), with "Authorization: Bearer <CRON_SECRET>".
// By default the radar is a request (the app asks on the Picks page), so this does nothing
// unless Settings, Routines has the radar on automatic. Then it runs only when it is due.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  return NextResponse.json(await runIfAuto(db, await loadSettings(db), "radar"));
}
