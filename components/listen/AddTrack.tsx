"use client";

import { useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { BUCKET } from "@/lib/media";
import { notifyPartner } from "@/lib/push";
import { fetchYouTubeTitle, parseYouTubeId } from "@/lib/youtube";
import type { Profile } from "@/lib/types";
import { Button, Problem } from "@/components/ui";

/**
 * Adding something to listen to: a pasted link, or a file.
 *
 * The "why this one" line is the point rather than a nicety — a song sent with
 * a reason is a different object from a song sent.
 */
export default function AddTrack({
  me,
  onAdded,
  onFlash,
}: {
  me: Profile;
  onAdded: () => void;
  onFlash: (message: string) => void;
}) {
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addLink() {
    if (busy) return;
    const videoId = parseYouTubeId(link);

    if (!videoId) {
      setProblem("That does not look like a YouTube link.");
      return;
    }

    setBusy(true);
    setProblem(null);

    const title = (await fetchYouTubeTitle(videoId)) ?? "YouTube track";

    const { error } = await supabaseBrowser().from("listen_queue").insert({
      added_by: me.id,
      source: "youtube",
      track_key: `youtube:${videoId}`,
      track_ref: videoId,
      title,
      note: note.trim() || null,
    });

    setBusy(false);
    if (error) {
      setProblem(error.message);
      return;
    }

    setLink("");
    setNote("");
    notifyPartner({
      title: me.display_name,
      body: note.trim() ? `queued ${title} — ${note.trim()}` : `queued ${title}`,
      url: "/listen",
      tag: "listen-queue",
    });
    onFlash("Queued");
    onAdded();
  }

  async function addFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    setProblem(null);

    try {
      const path = `audio/${me.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;

      const { error: uploadError } = await supabaseBrowser()
        .storage.from(BUCKET)
        .upload(path, file, { contentType: file.type || "audio/mpeg" });
      if (uploadError) throw uploadError;

      const { error } = await supabaseBrowser().from("listen_queue").insert({
        added_by: me.id,
        source: "upload",
        track_key: `upload:${path}`,
        track_ref: path,
        title: file.name.replace(/\.[^.]+$/, ""),
        note: note.trim() || null,
      });
      if (error) throw error;

      setNote("");
      onFlash("Queued");
      onAdded();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not add that file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mb-5 px-4 py-4">
      {problem && <Problem message={problem} />}

      <input
        type="url"
        inputMode="url"
        placeholder="Paste a YouTube link"
        value={link}
        onChange={(e) => setLink(e.target.value)}
      />

      <input
        type="text"
        maxLength={120}
        placeholder="Why this one? (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="mt-2"
      />

      <div className="mt-3 flex items-center gap-2">
        <Button onClick={addLink} disabled={!link.trim() || busy} className="flex-1">
          {busy ? "…" : "Add to queue"}
        </Button>
        <Button
          variant="quiet"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-label="Upload an audio file"
        >
          ⤴ File
        </Button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        onChange={addFile}
        className="hidden"
      />
    </div>
  );
}
