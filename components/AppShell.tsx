"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { installStaleBuildRecovery, markRecovered } from "@/lib/recover";

const TABS = [
  { href: "/", label: "Today", icon: "◉" },
  { href: "/chat", label: "Chat", icon: "✉" },
  { href: "/question", label: "Ask", icon: "✎" },
  { href: "/games", label: "Play", icon: "◆" },
  { href: "/timeline", label: "Us", icon: "❋" },
  { href: "/rituals", label: "Rituals", icon: "☾" },
];

export default function AppShell({
  children,
  meId,
  storedTimezone,
}: {
  children: React.ReactNode;
  meId: string;
  storedTimezone: string;
}) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  // We got here, so whatever the last load did, it worked.
  useEffect(() => {
    markRecovered();
    return installStaleBuildRecovery();
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        // An installed app can sit unopened for days. Checking on resume is
        // what stops it running against a build that no longer exists.
        const check = () => {
          if (document.visibilityState === "visible") registration.update();
        };
        document.addEventListener("visibilitychange", check);
        return () => document.removeEventListener("visibilitychange", check);
      })
      .catch(() => {});
  }, []);

  // The server derives "today" from the timezone on your profile, so it has to
  // follow you. The first page you open after travelling corrects it.
  useEffect(() => {
    const actual = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!actual || actual === storedTimezone) return;

    supabaseBrowser()
      .from("profiles")
      .update({ timezone: actual })
      .eq("id", meId)
      .then(() => {});
  }, [meId, storedTimezone]);

  const refreshUnread = useCallback(async () => {
    const { data } = await supabaseBrowser().rpc("chat_unread");
    setUnread(typeof data === "number" ? data : 0);
  }, []);

  useEffect(() => {
    refreshUnread();

    const sb = supabaseBrowser();
    const channel = sb
      .channel("chat-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () =>
        refreshUnread()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reads" }, () =>
        refreshUnread()
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [refreshUnread]);

  // Opening the chat clears it without waiting for a round trip.
  useEffect(() => {
    if (pathname === "/chat") setUnread(0);
  }, [pathname]);

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
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-1">
          {TABS.map((tab) => {
            const active =
              tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            const badge = tab.href === "/chat" ? unread : 0;

            return (
              <Link
                key={tab.href}
                href={tab.href}
                // `replace`, so switching tabs does not stack history entries.
                // Back then means "leave the app", as it does in a native tab
                // bar. Sub-pages inside a tab still push, so back leaves them.
                replace
                prefetch
                aria-current={active ? "page" : undefined}
                className="press relative flex flex-1 flex-col items-center gap-1 py-2.5"
              >
                <span className="relative">
                  <span
                    className={`text-lg leading-none transition-colors ${
                      active ? "text-ink" : "text-ink-faint"
                    }`}
                  >
                    {tab.icon}
                  </span>
                  {badge > 0 && (
                    <span className="absolute -right-2.5 -top-1 min-w-[1.05rem] rounded-full bg-rose px-1 text-center text-[0.625rem] font-bold leading-[1.05rem] text-white">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </span>
                <span
                  className={`text-[0.5625rem] font-medium transition-colors ${
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
