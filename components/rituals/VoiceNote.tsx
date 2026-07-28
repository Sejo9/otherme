"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { BUCKET } from "@/lib/media";
import { notifyPartner } from "@/lib/push";
import { localDay } from "@/lib/day";
import type { Profile } from "@/lib/types";
import { Button, Flash, Problem, Sheet, useFlash } from "@/components/ui";

const MAX_MS = 5 * 60 * 1000;

const WHEN: { id: string; label: string; hint: string; at: () => Date | null }[] = [
  { id: "now", label: "Now", hint: "Lands straight away", at: () => null },
  {
    id: "morning",
    label: "Their morning",
    hint: "Tomorrow at 7am",
    at: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(7, 0, 0, 0);
      return d;
    },
  },
  {
    id: "evening",
    label: "This evening",
    hint: "Tonight at 8pm",
    at: () => {
      const d = new Date();
      d.setHours(20, 0, 0, 0);
      if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
      return d;
    },
  },
  {
    id: "week",
    label: "In a week",
    hint: "Same time, seven days on",
    at: () => new Date(Date.now() + 7 * 86400000),
  },
];

/**
 * Record a voice note, optionally scheduled to arrive later.
 *
 * A scheduled note is invisible to them until `deliver_at` — the RLS policy on
 * timeline_entries withholds the row, so the recipient sees only that
 * something is coming.
 */
export default function VoiceNote({
  me,
  partner,
}: {
  me: Profile;
  partner: Profile | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [when, setWhen] = useState("now");
  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function start() {
    setProblem(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Safari has no webm/opus; it produces mp4/aac. Let the browser choose.
      const mime = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((t) => MediaRecorder.isTypeSupported(t));

      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];

      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      rec.onstop = () => {
        const recorded = new Blob(chunks.current, { type: rec.mimeType });
        setBlob(recorded);
        setPreviewUrl(URL.createObjectURL(recorded));
        stream.getTracks().forEach((t) => t.stop());
      };

      rec.start();
      recorder.current = rec;
      setRecording(true);
      setElapsed(0);

      const startedAt = Date.now();
      timer.current = setInterval(() => {
        const ms = Date.now() - startedAt;
        setElapsed(ms);
        if (ms >= MAX_MS) stop();
      }, 100);
    } catch (e) {
      setProblem(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in your browser settings and try again."
          : e instanceof Error
            ? e.message
            : "Could not start recording."
      );
    }
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    recorder.current?.stop();
    setRecording(false);
  }

  function discard() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setBlob(null);
    setPreviewUrl(null);
    setElapsed(0);
  }

  async function send() {
    if (!blob || saving) return;
    setSaving(true);
    setProblem(null);

    try {
      const sb = supabaseBrowser();
      const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      const path = `voice/${me.id}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await sb.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: blob.type });
      if (uploadError) throw uploadError;

      const deliverAt = WHEN.find((w) => w.id === when)?.at() ?? null;

      const { error } = await sb.from("timeline_entries").insert({
        author_id: me.id,
        kind: "voice",
        body: caption.trim() || null,
        media_path: path,
        duration_ms: Math.round(elapsed),
        deliver_at: deliverAt ? deliverAt.toISOString() : null,
        occurred_on: localDay(),
      });
      if (error) throw error;

      if (!deliverAt) {
        notifyPartner({
          title: me.display_name,
          body: "left you a voice note",
          url: "/timeline",
          tag: "voice",
        });
      }

      discard();
      setCaption("");
      setWhen("now");
      setOpen(false);
      setFlash(deliverAt ? "Scheduled" : "Sent");
      router.refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Could not send that.");
    } finally {
      setSaving(false);
    }
  }

  const seconds = Math.floor(elapsed / 1000);
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <>
      <button onClick={() => setOpen(true)} className="press card w-full px-4 py-4 text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Voice note</p>
            <p className="mt-0.5 text-[0.75rem] leading-snug text-ink-faint">
              Say it out loud. Send it now or have it arrive tomorrow morning.
            </p>
          </div>
          <span className="shrink-0 text-xl">🎙️</span>
        </div>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Voice note">
        <div className={`accent-${me.accent} flex flex-col gap-5 pb-2`}>
          {problem && <Problem message={problem} />}

          <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-sunken py-7">
            {!blob ? (
              <>
                <button
                  onClick={recording ? stop : start}
                  aria-label={recording ? "Stop recording" : "Start recording"}
                  className={`press relative flex h-20 w-20 items-center justify-center rounded-full text-2xl ${
                    recording ? "pulse-ring" : ""
                  }`}
                  style={{
                    background: recording ? "var(--rose-soft)" : "var(--accent-soft)",
                    border: `1px solid ${recording ? "var(--rose)" : "var(--accent)"}`,
                  }}
                >
                  {recording ? "■" : "🎙️"}
                </button>
                <p className="text-sm tabular-nums">
                  {recording ? time : "Tap to record"}
                </p>
                {recording && (
                  <p className="text-[0.6875rem] text-ink-faint">
                    Up to 5 minutes · tap again to stop
                  </p>
                )}
              </>
            ) : (
              <>
                <audio src={previewUrl ?? undefined} controls className="w-full max-w-xs" />
                <button onClick={discard} className="text-[0.8125rem] text-ink-faint underline">
                  Record it again
                </button>
              </>
            )}
          </div>

          {blob && (
            <>
              <div>
                <p className="label mb-1.5">A line to go with it (optional)</p>
                <input
                  type="text"
                  maxLength={140}
                  placeholder="What is this?"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                />
              </div>

              <div>
                <p className="label mb-2">When should it reach them?</p>
                <div className="grid grid-cols-2 gap-2">
                  {WHEN.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => setWhen(w.id)}
                      className="press rounded-2xl border px-3 py-2.5 text-left"
                      style={
                        when === w.id
                          ? { borderColor: "var(--accent)", background: "var(--accent-soft)" }
                          : { borderColor: "var(--line)" }
                      }
                    >
                      <span className="block text-[0.8125rem] font-medium">{w.label}</span>
                      <span className="block text-[0.6875rem] text-ink-faint">{w.hint}</span>
                    </button>
                  ))}
                </div>
                {when !== "now" && (
                  <p className="mt-2 text-[0.75rem] leading-relaxed text-ink-faint">
                    {partner?.display_name ?? "They"} will see that something is coming, but
                    won&apos;t be able to hear it until then.
                  </p>
                )}
              </div>

              <Button onClick={send} disabled={saving} className="w-full py-3">
                {saving ? "…" : when === "now" ? "Send it" : "Schedule it"}
              </Button>
            </>
          )}
        </div>
      </Sheet>

      <Flash>{flash}</Flash>
    </>
  );
}
