"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const TABS = [
  { href: "/", label: "Today", icon: "◉" },
  { href: "/question", label: "Question", icon: "✎" },
  { href: "/knowme", label: "Know me", icon: "◆" },
  { href: "/timeline", label: "Us", icon: "❋" },
  { href: "/rituals", label: "Rituals", icon: "☾" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Register the service worker once, on first mount of any authenticated page.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
  }, []);

  return (
    <div className="min-h-dvh">
      <main
        className="mx-auto w-full max-w-lg px-4 pt-[max(1rem,env(safe-area-inset-top))]"
        style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
      >
        {children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-raised/85 backdrop-blur-xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-2">
          {TABS.map((tab) => {
            const active =
              tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className="press flex flex-1 flex-col items-center gap-1 py-2.5"
              >
                <span
                  className={`text-lg leading-none transition-colors ${
                    active ? "text-ink" : "text-ink-faint"
                  }`}
                >
                  {tab.icon}
                </span>
                <span
                  className={`text-[0.625rem] font-medium transition-colors ${
                    active ? "text-ink" : "text-ink-faint"
                  }`}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
