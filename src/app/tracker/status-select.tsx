"use client";

import { useTransition } from "react";
import { STATUSES, type Status } from "@/lib/tracker";
import { setStatus } from "./actions";

export function StatusSelect({ id, value }: { id: string; value: Status }) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label="Stage"
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        startTransition(() => setStatus(id, next));
      }}
      className="glass-input rounded-full px-3 py-1.5 text-xs outline-none disabled:opacity-50"
    >
      {STATUSES.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
