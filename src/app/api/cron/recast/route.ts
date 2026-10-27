import { NextResponse, type NextRequest } from "next/server";
import { runIfAuto } from "@/lib/routine";
import { loadSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

// Monthly check (vercel.json), with "Authorization: Bearer <CRON_SECRET>". Its own route so the
// research has the full time limit. By default the recast watch is a request (the app asks on
// the Picks page), so this does nothing unless Settings, Routines has it on automatic.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  return NextResponse.json(await runIfAuto(db, await loadSettings(db), "recast"));
}
