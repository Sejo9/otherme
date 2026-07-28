"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { notifyPartner } from "@/lib/push";
import { PULSES, type Profile, type Pulse, type PulseKind } from "@/lib/types";
import { ago } from "@/lib/day";
import { Flash, Sheet, useFlash } from "@/components/ui";

const KINDS = Object.keys(PULSES) as PulseKind[];

/**
 * The pulse: a wordless tap that lands on the other person's phone.
 *
 * Long-press (or the "…" affordance) to pick a flavour; a plain tap sends
 * "thinking of you", because the whole point is that it costs nothing.
 */
export default function PulseBar({
  me,
  partner,
  initialReceived,
}: {
  me: Profile;
  partner: Profile | null;
  initialReceived: Pulse[];
}) {
  const [received, setReceived] = useState(initialReceived);
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);
  const [incoming, setIncoming] = useState<Pulse | null>(null);
  const [flash, setFlash] = useFlash();

  // Live: a pulse sent while you have the app open should land immediately.
  useEffect(() => {
    const channel = supabaseBrowser()
      .channel("pulses")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pulses", filter: `to_user=eq.${me.id}` },
        ({ new: row }) => {
          const pulse = row as Pulse;
          setReceived((prev) => [pulse, ...prev].slice(0, 12));
          setIncoming(pulse);
          navigator.vibrate?.([30, 50, 30]);
          setTimeout(() => setIncoming(null), 3600);
        }
      )
      .subscribe();

    return () => {
      supabaseBrowser().removeChannel(channel);
    };
  }, [me.id]);

  async function send(kind: PulseKind) {
    if (!partner || sending) return;
    setSending(true);
    setPicking(false);
    navigator.vibrate?.(20);

    const { error } = await supabaseBrowser()
      .from("pulses")
      .insert({ from_user: me.id, to_user: partner.id, kind });

    setSending(false);
    if (error) {
      setFlash("Could not send that");
      return;
    }

    notifyPartner({
      title: me.display_name,
      body: PULSES[kind].label.toLowerCase(),
      url: "/",
      tag: `pulse-${kind}`,
    });
    setFlash(`${PULSES[kind].icon} sent`);
  }

  const last = received[0];

  return (
    <>
      <div
        className={`card accent-${partner?.accent ?? "rose"} relative overflow-hidden px-4 py-4 ${
          incoming ? "receiving-pulse" : ""
        }`}
        style={incoming ? { background: "var(--accent-soft)" } : undefined}
      >
        {incoming ? (
          <div className="rise flex flex-col items-center gap-1 py-2 text-center">
            <span className="text-4xl">{PULSES[incoming.kind].icon}</span>
            <p className="text-sm font-medium">
              {partner?.display_name} — {PULSES[incoming.kind].label.toLowerCase()}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <button
              onClick={() => send("thinking")}
              onContextMenu={(e) => {
                e.preventDefault();
                setPicking(true);
              }}
              disabled={!partner || sending}
              aria-label="Send a pulse"
              className={`press relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-2xl disabled:opacity-40 ${
                sending ? "pulse-ring" : ""
              }`}
              style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)" }}
            >
              💗
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Send a pulse</p>
              <p className="text-[0.75rem] leading-snug text-ink-soft">
                {last
                  ? `${PULSES[last.kind].icon} ${partner?.display_name ?? "They"} ${ago(
                      last.created_at
                    )}`
                  : "One tap. No words needed."}
              </p>
            </div>

            <button
              onClick={() => setPicking(true)}
              aria-label="Choose a different pulse"
              className="press shrink-0 rounded-full border border-line px-3 py-2 text-xs text-ink-soft"
            >
              •••
            </button>
          </div>
        )}
      </div>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Send">
        <div className="grid grid-cols-2 gap-2 pb-2">
          {KINDS.map((kind) => (
            <button
              key={kind}
              onClick={() => send(kind)}
              className="press flex items-center gap-3 rounded-2xl border border-line bg-sunken px-4 py-3.5 text-left"
            >
              <span className="text-2xl">{PULSES[kind].icon}</span>
              <span className="text-sm font-medium">{PULSES[kind].label}</span>
            </button>
          ))}
        </div>

        {received.length > 0 && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="label mb-2">Lately</p>
            <ul className="flex flex-col gap-1.5">
              {received.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm text-ink-soft">
                  <span>{PULSES[p.kind].icon}</span>
                  <span className="flex-1">{PULSES[p.kind].label}</span>
                  <span className="text-xs text-ink-faint">{ago(p.created_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Sheet>

      <Flash>{flash}</Flash>
    </>
  );
}
