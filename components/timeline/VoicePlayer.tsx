"use client";

import { useEffect, useRef, useState } from "react";
import { useSignedUrl } from "@/lib/media";

function clock(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * A voice note player with a scrubber. Deliberately not an <audio controls> —
 * the native widget is enormous and looks like a file attachment rather than
 * something someone said to you.
 */
export default function VoicePlayer({
  path,
  durationMs,
}: {
  path: string;
  durationMs?: number | null;
}) {
  const url = useSignedUrl(path);
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [length, setLength] = useState(durationMs ?? 0);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;

    const onTime = () => setPosition(audio.currentTime * 1000);
    const onEnd = () => {
      setPlaying(false);
      setPosition(0);
    };
    const onMeta = () => {
      // Chrome reports Infinity for MediaRecorder blobs until it has seeked.
      if (Number.isFinite(audio.duration)) setLength(audio.duration * 1000);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("loadedmetadata", onMeta);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("loadedmetadata", onMeta);
    };
  }, [url]);

  function toggle() {
    const audio = ref.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
    }
  }

  const pct = length > 0 ? Math.min(100, (position / length) * 100) : 0;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-sunken px-3 py-2.5">
      <button
        onClick={toggle}
        disabled={!url}
        aria-label={playing ? "Pause" : "Play"}
        className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm disabled:opacity-40"
        style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)" }}
      >
        {playing ? "❚❚" : "▶"}
      </button>

      <div className="min-w-0 flex-1">
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
        >
          <div
            className="h-full rounded-full transition-[width] duration-150"
            style={{ width: `${pct}%`, background: "var(--accent)" }}
          />
        </div>
        <p className="mt-1 text-[0.6875rem] tabular-nums text-ink-faint">
          {clock(position)} {length > 0 && `/ ${clock(length)}`}
        </p>
      </div>

      {url && <audio ref={ref} src={url} preload="metadata" className="hidden" />}
    </div>
  );
}
