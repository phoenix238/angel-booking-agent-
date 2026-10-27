"use client";

import { useActionState } from "react";
import { Radar } from "lucide-react";
import { refreshRecast, scanRadar } from "./actions";

export function ScanButton() {
  const [state, action, pending] = useActionState(scanRadar, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button type="submit" disabled={pending} className="glass-chip inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs hover:bg-white/70 disabled:opacity-50">
        <Radar className={`size-3.5 text-oxblood ${pending ? "animate-spin" : ""}`} aria-hidden />
        {pending ? "Scanning theatres... about 2 minutes" : "Scan for new shows now"}
      </button>
      {state.ok && <span className="text-xs text-emerald-800">{state.ok}</span>}
      {state.error && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  );
}

export function RecastButton() {
  const [state, action, pending] = useActionState(refreshRecast, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button type="submit" disabled={pending} className="glass-chip inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs hover:bg-white/70 disabled:opacity-50">
        <Radar className={`size-3.5 text-oxblood ${pending ? "animate-spin" : ""}`} aria-hidden />
        {pending ? "Checking cast changes... about 3 minutes" : "Refresh the recast watch"}
      </button>
      {state.ok && <span className="text-xs text-emerald-800">{state.ok}</span>}
      {state.error && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  );
}
