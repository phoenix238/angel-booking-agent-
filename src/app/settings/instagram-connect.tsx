"use client";

import { useActionState } from "react";
import { connectInstagramAction, type ConnectState } from "./instagram-actions";

const input = "glass-input w-full rounded-2xl px-3.5 py-2 text-sm outline-none focus:ring-2 focus:ring-oxblood/30";

export function InstagramConnectForm({ reconnect }: { reconnect: boolean }) {
  const [state, action, pending] = useActionState<ConnectState, FormData>(connectInstagramAction, {});
  return (
    <form action={action} className="space-y-3" autoComplete="off">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">App ID</span>
          <input name="appId" inputMode="numeric" className={input} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">App secret</span>
          <input name="appSecret" type="password" className={input} />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Access token from the Graph API Explorer</span>
        <input name="token" type="password" className={input} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-full bg-oxblood px-4 py-2 text-sm text-paper transition hover:brightness-110 disabled:opacity-50">
          {pending ? "Connecting..." : reconnect ? "Reconnect Instagram" : "Connect Instagram"}
        </button>
        {state.ok && <span className="text-sm text-emerald-800">{state.ok}</span>}
        {state.error && <span className="text-sm text-destructive">{state.error}</span>}
      </div>
      <p className="text-xs text-ink-soft">These are kept on the server only. The app secret is used once and not stored.</p>
    </form>
  );
}
