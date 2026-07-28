"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uploadImage } from "@/lib/media";
import { notifyPartner } from "@/lib/push";
import { localDay } from "@/lib/day";
import { ENTRY_KINDS, type EntryKind, type Profile } from "@/lib/types";
import { Button, Sheet } from "@/components/ui";

/** The kinds you can add by hand. Photos-of-the-day are added from Today. */
const ADDABLE: EntryKind[] = ["note", "photo", "milestone", "song", "joke", "place"];

const PLACEHOLDER: Record<EntryKind, string> = {
  note: "Something worth keeping.",
  photo: "What was happening?",
  appreciation: "What did they do?",
  milestone: "What happened?",
  song: "Why this song, for them, today?",
  joke: "Explain it for future us, who will have forgotten.",
  place: "What happened here?",
};

export default function AddEntry({ me }: { me: Profile }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<EntryKind>("note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [place, setPlace] = useState("");
  const [day, setDay] = useState(localDay());
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setKind("note");
    setTitle("");
    setBody("");
    setLink("");
    setPlace("");
    setDay(localDay());
    setFile(null);
  }

  async function save() {
    if (saving) return;
    setSaving(true);

    try {
      const media_path = file ? await uploadImage(file, `timeline/${me.id}`) : null;

      const { error } = await supabaseBrowser().from("timeline_entries").insert({
        author_id: me.id,
        kind,
        title: title.trim() || null,
        body: body.trim() || null,
        media_path,
        link_url: link.trim() || null,
        place_name: place.trim() || null,
        occurred_on: day,
      });
      if (error) throw error;

      notifyPartner({
        title: me.display_name,
        body: `added ${kind === "joke" ? "an inside joke" : `a ${ENTRY_KINDS[kind].label.toLowerCase()}`} to your timeline`,
        url: "/timeline",
        tag: "timeline",
      });

      reset();
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Add to the timeline"
        className="press fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-2xl text-bg shadow-lg"
        style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
      >
        ＋
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Add to us">
        <div className={`accent-${me.accent} flex flex-col gap-4 pb-2`}>
          <div className="flex flex-wrap gap-2">
            {ADDABLE.map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`pill press ${kind === k ? "pill-active" : ""}`}
              >
                <span>{ENTRY_KINDS[k].icon}</span>
                {ENTRY_KINDS[k].label}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <textarea
            rows={4}
            placeholder={PLACEHOLDER[kind]}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />

          {kind === "song" && (
            <input
              type="url"
              inputMode="url"
              placeholder="Link to the song"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          )}

          {kind === "place" && (
            <input
              type="text"
              placeholder="Where?"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
            />
          )}

          <div>
            <p className="label mb-1.5">Photo</p>
            <button
              onClick={() => fileRef.current?.click()}
              className="press w-full rounded-2xl border border-dashed border-line bg-sunken px-4 py-3 text-sm text-ink-soft"
            >
              {file ? `📷 ${file.name}` : "Attach a photo (optional)"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </div>

          <div>
            <p className="label mb-1.5">When did this happen?</p>
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </div>

          <Button
            onClick={save}
            disabled={saving || (!body.trim() && !title.trim() && !file)}
            className="w-full py-3"
          >
            {saving ? "…" : "Keep it"}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
