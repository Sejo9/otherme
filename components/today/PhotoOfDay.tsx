"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uploadImage, useSignedUrl } from "@/lib/media";
import { notifyPartner } from "@/lib/push";
import { localDay } from "@/lib/day";
import type { Profile, TimelineEntry } from "@/lib/types";
import { Flash, useFlash } from "@/components/ui";

function Slot({
  entry,
  label,
  accent,
  onPick,
  busy,
}: {
  entry: TimelineEntry | null;
  label: string;
  accent: string;
  onPick?: () => void;
  busy?: boolean;
}) {
  const url = useSignedUrl(entry?.media_path);
  const interactive = !!onPick;

  const inner = (
    <>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={entry?.body ?? label}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
          <span className="text-xl opacity-40">{busy ? "…" : interactive ? "＋" : "○"}</span>
          <span className="px-2 text-[0.6875rem] leading-tight text-ink-faint">
            {busy ? "Uploading" : interactive ? "Add today's photo" : "Nothing yet today"}
          </span>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-6">
        <p className="text-[0.6875rem] font-medium text-white/90">{label}</p>
        {entry?.body && (
          <p className="line-clamp-1 text-[0.6875rem] text-white/70">{entry.body}</p>
        )}
      </div>
    </>
  );

  const className = `accent-${accent} relative aspect-[4/5] overflow-hidden rounded-2xl border border-line bg-sunken`;

  return interactive ? (
    <button onClick={onPick} disabled={busy} className={`press ${className}`}>
      {inner}
    </button>
  ) : (
    <div className={className}>{inner}</div>
  );
}

/**
 * One photo each per day. No captions required, no reactions, no like count.
 * A window into their day, not a post.
 */
export default function PhotoOfDay({
  me,
  partner,
}: {
  me: Profile;
  partner: Profile | null;
}) {
  const [mine, setMine] = useState<TimelineEntry | null>(null);
  const [theirs, setTheirs] = useState<TimelineEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useFlash();
  const fileRef = useRef<HTMLInputElement>(null);
  const day = localDay();

  useEffect(() => {
    let cancelled = false;

    supabaseBrowser()
      .from("timeline_entries")
      .select("*")
      .eq("kind", "photo")
      .eq("occurred_on", day)
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data ?? []) as TimelineEntry[];
        setMine(rows.find((r) => r.author_id === me.id) ?? null);
        setTheirs(rows.find((r) => r.author_id !== me.id) ?? null);
      });

    const channel = supabaseBrowser()
      .channel("photo-of-day")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "timeline_entries" },
        ({ new: row }) => {
          const entry = row as TimelineEntry;
          if (entry.kind !== "photo" || entry.occurred_on !== day) return;
          if (entry.author_id === me.id) setMine(entry);
          else setTheirs(entry);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabaseBrowser().removeChannel(channel);
    };
  }, [me.id, day]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    try {
      const path = await uploadImage(file, `photos/${me.id}`);

      // One photo per person per day: today's replaces rather than piles up.
      await supabaseBrowser()
        .from("timeline_entries")
        .delete()
        .eq("author_id", me.id)
        .eq("kind", "photo")
        .eq("occurred_on", day);

      const { data, error } = await supabaseBrowser()
        .from("timeline_entries")
        .insert({ author_id: me.id, kind: "photo", media_path: path, occurred_on: day })
        .select()
        .single();

      if (error) throw error;
      setMine(data as TimelineEntry);
      notifyPartner({
        title: me.display_name,
        body: "shared a photo from their day",
        url: "/",
        tag: "photo",
      });
      setFlash("Shared");
    } catch {
      setFlash("Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Slot
          entry={mine}
          label="You"
          accent={me.accent}
          busy={busy}
          onPick={() => fileRef.current?.click()}
        />
        <Slot
          entry={theirs}
          label={partner?.display_name ?? "Them"}
          accent={partner?.accent ?? "rose"}
        />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        className="hidden"
      />

      <Flash>{flash}</Flash>
    </>
  );
}
