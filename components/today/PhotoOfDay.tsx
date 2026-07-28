"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uploadImage, useSignedUrl } from "@/lib/media";
import { notifyPartner } from "@/lib/push";
import { localDay } from "@/lib/day";
import type { Profile, TimelineEntry } from "@/lib/types";
import { Flash, Sheet, useFlash } from "@/components/ui";
import { dayIsStale, type TodaySnapshot } from "./types";

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
  serverDay,
  snapshot,
}: {
  me: Profile;
  partner: Profile | null;
  serverDay: string;
  snapshot: TodaySnapshot | null;
}) {
  const initial = snapshot?.photos ?? [];
  const [mine, setMine] = useState<TimelineEntry | null>(
    initial.find((p) => p.author_id === me.id) ?? null
  );
  const [theirs, setTheirs] = useState<TimelineEntry | null>(
    initial.find((p) => p.author_id !== me.id) ?? null
  );
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [flash, setFlash] = useFlash();

  // Two inputs, because `capture` is a hint that cannot be toggled reliably
  // once the picker is open: one forces the camera, one forces the library.
  // Desktop browsers ignore `capture` and open a file dialog for both, so the
  // same two choices work everywhere.
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  // The server already rendered today's photos; this only matters if its idea
  // of "today" was stale (you travelled, or midnight passed).
  const [day, setDay] = useState(serverDay);

  useEffect(() => {
    const clientDay = localDay();
    if (!dayIsStale(serverDay, clientDay)) return;

    setDay(clientDay);
    let cancelled = false;

    supabaseBrowser()
      .from("timeline_entries")
      .select("*")
      .eq("kind", "photo")
      .eq("occurred_on", clientDay)
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data ?? []) as TimelineEntry[];
        setMine(rows.find((r) => r.author_id === me.id) ?? null);
        setTheirs(rows.find((r) => r.author_id !== me.id) ?? null);
      });

    return () => {
      cancelled = true;
    };
  }, [serverDay, me.id]);

  useEffect(() => {
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
      supabaseBrowser().removeChannel(channel);
    };
  }, [me.id, day]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setChoosing(false);
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
          onPick={() => setChoosing(true)}
        />
        <Slot
          entry={theirs}
          label={partner?.display_name ?? "Them"}
          accent={partner?.accent ?? "rose"}
        />
      </div>

      <Sheet
        open={choosing}
        onClose={() => setChoosing(false)}
        title={mine ? "Replace today's photo" : "Today's photo"}
      >
        <div className="flex flex-col gap-2 pb-2">
          <PickOption
            icon="📷"
            title="Take a photo"
            hint="Opens the camera"
            onClick={() => cameraRef.current?.click()}
          />
          <PickOption
            icon="🖼️"
            title="Choose an existing photo"
            hint="From your library or files"
            onClick={() => libraryRef.current?.click()}
          />
        </div>
      </Sheet>

      {/* `capture` asks the OS for the camera; without it you get the library. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        className="hidden"
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        onChange={onFile}
        className="hidden"
      />

      <Flash>{flash}</Flash>
    </>
  );
}

function PickOption({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: string;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="press flex items-center gap-3 rounded-2xl border border-line bg-sunken px-4 py-3.5 text-left"
    >
      <span className="text-2xl">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-[0.75rem] text-ink-faint">{hint}</span>
      </span>
    </button>
  );
}
