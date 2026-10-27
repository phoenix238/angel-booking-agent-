import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

type TabKey = "dashboard" | "picks" | "emails" | "tracker" | "show" | "studios" | "profile" | "settings";

export async function AppHeader({ active }: { active: TabKey }) {
  const st = await getSettings();
  const TABS = [
    { key: "dashboard", href: "/", label: "Matches" },
    { key: "picks", href: "/digest", label: "Picks" },
    { key: "emails", href: "/emails", label: "Emails" },
    { key: "tracker", href: "/tracker", label: "Tracker" },
    { key: "show", href: "/show", label: "Projects" },
    { key: "studios", href: "/studios", label: "Studios" },
    { key: "profile", href: "/profile", label: st.client.firstName },
    { key: "settings", href: "/settings", label: "Settings" },
  ] as const;
  return (
    <header className="sticky top-0 z-20 px-4 pt-4">
      {/* Phones: name and sign out on top, tabs on a second row. Wider: one pill. */}
      <div className="glass mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-1 rounded-[28px] p-2 pl-4 md:h-14 md:flex-nowrap md:rounded-full md:px-3 md:py-0 md:pl-5">
        <Link href="/" className="mr-auto flex items-baseline gap-2 whitespace-nowrap">
          <span className="font-serif text-lg italic tracking-tight md:text-xl">{st.client.name}</span>
          <span className="eyebrow hidden lg:inline">{st.agent.name}</span>
        </Link>
        <nav
          className="order-last flex w-full flex-wrap items-center justify-center gap-1 rounded-[22px] bg-white/30 p-1 md:order-none md:w-auto md:flex-nowrap md:justify-start md:rounded-full"
          aria-label="Main"
        >
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              aria-current={active === t.key ? "page" : undefined}
              className={cn(
                "whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] transition-all duration-300 md:px-3.5 md:text-sm",
                active === t.key ? "bg-oxblood text-paper shadow-[0_6px_16px_-8px_rgb(136_28_36/0.8)]" : "text-ink-soft hover:bg-white/60 hover:text-ink",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <form action={signOut}>
          <button type="submit" className="rounded-full px-3 py-1.5 text-xs text-ink-soft hover:bg-white/60 hover:text-ink">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
