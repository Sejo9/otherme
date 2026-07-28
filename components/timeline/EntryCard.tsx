"use client";

import { useState } from "react";
import { downloadFile, downloadName, useSignedUrl } from "@/lib/media";
import { prettyDay } from "@/lib/day";
import { ENTRY_KINDS, type Profile, type TimelineEntry } from "@/lib/types";
import { useBackDismiss } from "@/components/ui";
import VoicePlayer from "./VoicePlayer";

export default function EntryCard({
  entry,
  author,
  isMine,
  compact = false,
}: {
  entry: TimelineEntry;
  author: Profile | null;
  isMine: boolean;
  compact?: boolean;
}) {
  const isAudio = entry.kind === "voice";
  const url = useSignedUrl(isAudio ? null : entry.media_path);
  const [saving, setSaving] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const kind = ENTRY_KINDS[entry.kind];

  // Back should close the photo, not leave the timeline.
  useBackDismiss(lightbox, () => setLightbox(false));

  async function save() {
    if (!entry.media_path || saving) return;
    setSaving(true);
    try {
      await downloadFile(
        entry.media_path,
        downloadName(entry.kind, entry.occurred_on, entry.media_path)
      );
    } catch {
      /* the button returns to idle; nothing worth interrupting them for */
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <article className={`card accent-${author?.accent ?? "amber"} overflow-hidden`}>
        {url && (
          <button
            onClick={() => setLightbox(true)}
            className="block w-full"
            aria-label="View full size"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={entry.title ?? kind.label}
              className="max-h-80 w-full object-cover"
            />
          </button>
        )}

        <div className="px-4 py-3.5">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-sm">{kind.icon}</span>
            <span
              className="text-[0.6875rem] font-semibold"
              style={{ color: "var(--accent)" }}
            >
              {isMine ? "You" : (author?.display_name ?? "Them")}
            </span>
            {!compact && (
              <span className="ml-auto text-[0.6875rem] text-ink-faint">
                {prettyDay(entry.occurred_on)}
              </span>
            )}
          </div>

          {entry.title && (
            <h3 className="font-serif text-[1.0625rem] leading-snug">{entry.title}</h3>
          )}

          {isAudio && entry.media_path && (
            <div className="mt-2">
              <VoicePlayer path={entry.media_path} durationMs={entry.duration_ms} />
            </div>
          )}

          {entry.body && (
            <p className="mt-1 whitespace-pre-wrap text-[0.875rem] leading-relaxed text-ink-soft">
              {entry.body}
            </p>
          )}

          {entry.place_name && (
            <p className="mt-1.5 text-[0.8125rem] text-ink-soft">📍 {entry.place_name}</p>
          )}

          {entry.link_url && (
            <a
              href={entry.link_url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block truncate text-[0.8125rem] underline"
              style={{ color: "var(--accent)" }}
            >
              {entry.link_url.replace(/^https?:\/\//, "").slice(0, 48)}
            </a>
          )}

          {entry.media_path && (
            <button
              onClick={save}
              disabled={saving}
              className="press mt-3 rounded-full border border-line px-3 py-1.5 text-[0.75rem] text-ink-soft disabled:opacity-50"
            >
              {saving ? "Saving…" : isAudio ? "↓ Save audio" : "↓ Save photo"}
            </button>
          )}
        </div>
      </article>

      {lightbox && url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={entry.title ?? kind.label}
            className="max-h-full max-w-full object-contain"
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              save();
            }}
            className="press absolute bottom-8 rounded-full bg-white/90 px-5 py-2.5 text-sm font-medium text-black"
            style={{ bottom: "calc(2rem + env(safe-area-inset-bottom))" }}
          >
            {saving ? "Saving…" : "↓ Save photo"}
          </button>
        </div>
      )}
    </>
  );
}
