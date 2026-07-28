"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { notifyPartner } from "@/lib/push";
import { localDay, ago } from "@/lib/day";
import type { NightlyCheckin, Profile } from "@/lib/types";
import { Button, Flash, Sheet, useFlash } from "@/components/ui";

/**
 * A high, a low, and one thing I appreciated about you today.
 *
 * The appreciation is the load-bearing part: it is also written to the
 * timeline, so the ledger builds itself out of a nightly habit rather than
 * needing its own ritual.
 */
export default function NightlyThree({
  me,
  partner,
}: {
  me: Profile;
  partner: Profile | null;
}) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<NightlyCheckin | null>(null);
  const [theirs, setTheirs] = useState<NightlyCheckin | null>(null);
  const [high, setHigh] = useState("");
  const [low, setLow] = useState("");
  const [appreciation, setAppreciation] = useState("");
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useFlash();
  const day = localDay();

  useEffect(() => {
    let cancelled = false;

    supabaseBrowser()
      .from("nightly_checkins")
      .select("*")
      .eq("day", day)
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data ?? []) as NightlyCheckin[];
        const own = rows.find((r) => r.user_id === me.id) ?? null;
        setMine(own);
        setTheirs(rows.find((r) => r.user_id !== me.id) ?? null);
        if (own) {
          setHigh(own.high ?? "");
          setLow(own.low ?? "");
          setAppreciation(own.appreciation ?? "");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [me.id, day]);

  async function save() {
    if (saving) return;
    setSaving(true);
    const sb = supabaseBrowser();

    const { data, error } = await sb
      .from("nightly_checkins")
      .upsert(
        {
          user_id: me.id,
          day,
          high: high.trim() || null,
          low: low.trim() || null,
          appreciation: appreciation.trim() || null,
        },
        { onConflict: "user_id,day" }
      )
      .select()
      .single();

    if (error) {
      setSaving(false);
      setFlash("Could not save that");
      return;
    }

    // Mirror the appreciation onto the timeline so the ledger accrues. Replace
    // today's rather than duplicating if they edit their check-in.
    if (appreciation.trim()) {
      await sb
        .from("timeline_entries")
        .delete()
        .eq("author_id", me.id)
        .eq("kind", "appreciation")
        .eq("occurred_on", day);

      await sb.from("timeline_entries").insert({
        author_id: me.id,
        kind: "appreciation",
        body: appreciation.trim(),
        occurred_on: day,
      });
    }

    setMine(data as NightlyCheckin);
    setSaving(false);
    setOpen(false);

    notifyPartner({
      title: me.display_name,
      body: appreciation.trim()
        ? "left you something in tonight's check-in"
        : "did their nightly three",
      url: "/rituals",
      tag: "nightly",
    });
    setFlash("Saved");
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="press card w-full px-4 py-4 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Nightly three</p>
            <p className="mt-0.5 text-[0.75rem] leading-snug text-ink-faint">
              A high, a low, and one thing about them.
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[0.6875rem] font-medium ${
              mine ? "border border-line text-ink-faint" : "bg-ink text-bg"
            }`}
          >
            {mine ? "Done" : "Tonight"}
          </span>
        </div>

        {theirs && (
          <div className={`accent-${partner?.accent ?? "rose"} mt-3 border-t border-line pt-3`}>
            <p className="label mb-1" style={{ color: "var(--accent)" }}>
              {partner?.display_name ?? "Them"} · {ago(theirs.created_at)}
            </p>
            {theirs.appreciation ? (
              <p className="text-[0.875rem] leading-relaxed">💛 {theirs.appreciation}</p>
            ) : (
              <p className="text-[0.8125rem] text-ink-faint">Checked in.</p>
            )}
          </div>
        )}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Tonight">
        <div className={`accent-${me.accent} flex flex-col gap-5 pb-2`}>
          <Field
            label="The high"
            hint="Best moment of the day, however small."
            value={high}
            onChange={setHigh}
          />
          <Field
            label="The low"
            hint="What was hard, or heavy, or annoying."
            value={low}
            onChange={setLow}
          />
          <Field
            label={`One thing about ${partner?.display_name ?? "them"}`}
            hint="Something specific they did or were today. This one goes in the ledger."
            value={appreciation}
            onChange={setAppreciation}
          />

          <Button onClick={save} disabled={saving} className="w-full py-3">
            {saving ? "…" : mine ? "Update" : "Done for today"}
          </Button>
        </div>
      </Sheet>

      <Flash>{flash}</Flash>
    </>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="label mb-0.5">{label}</p>
      <p className="mb-2 text-[0.75rem] text-ink-faint">{hint}</p>
      <textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
