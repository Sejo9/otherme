"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { notifyPartner } from "@/lib/push";
import { clock, correctionFor, measureClockOffset, targetPosition } from "@/lib/sync";
import { YT_STATE, loadYouTubeApi, type YTPlayer } from "@/lib/youtube";
import type { Profile } from "@/lib/types";
import { Flash, Problem, Section, useFlash } from "@/components/ui";
import AddTrack from "./AddTrack";
import ReactionTrack from "./ReactionTrack";
import { KINDS, type QueueItem, type Reaction, type SyncKind, type SyncSnapshot } from "./types";

/** How often we compare where we are to where we should be. */
const CHECK_EVERY_MS = 2000;

export default function SyncRoom({
  kind,
  me,
  partner,
}: {
  kind: SyncKind;
  me: Profile;
  partner: Profile | null;
}) {
  const config = KINDS[kind];
  const them = partner?.display_name ?? "They";

  const [snapshot, setSnapshot] = useState<SyncSnapshot | null>(null);
  const [offset, setOffset] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();

  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [partnerHere, setPartnerHere] = useState(false);
  const [floating, setFloating] = useState<Reaction[]>([]);

  const mount = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const media = useRef<HTMLVideoElement>(null);
  const loadedRef = useRef<string | null>(null);

  const room = snapshot?.room ?? null;
  const isYouTube = room?.source === "youtube";

  // --- loading --------------------------------------------------------------
  const load = useCallback(async () => {
    const startedAt = Date.now();
    const { data, error } = await supabaseBrowser().rpc("sync_snapshot", { p_kind: kind });
    const finishedAt = Date.now();

    if (error) {
      setProblem(error.message);
      return;
    }

    const fresh = data as SyncSnapshot;
    setSnapshot(fresh);
    setOffset(measureClockOffset(fresh.server_now, startedAt, finishedAt));
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);

  const advance = useCallback(async () => {
    const { data, error } = await supabaseBrowser().rpc("sync_next", { p_kind: kind });
    if (error) setProblem(error.message);
    else setSnapshot(data as SyncSnapshot);
  }, [kind]);

  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  // --- live -----------------------------------------------------------------
  useEffect(() => {
    const sb = supabaseBrowser();

    const channel = sb
      .channel(`sync-${kind}`, { config: { presence: { key: me.id } } })
      .on("postgres_changes", { event: "*", schema: "public", table: "sync_rooms" }, () =>
        load()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "sync_queue" }, () =>
        load()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sync_reactions" },
        ({ new: row }) => {
          const reaction = row as Reaction;
          setSnapshot((prev) =>
            prev && reaction.track_key === prev.room.track_key
              ? { ...prev, reactions: [...prev.reactions, reaction] }
              : prev
          );
          // Anything arriving live floats over the picture for a moment.
          setFloating((prev) => [...prev, reaction]);
          setTimeout(
            () => setFloating((prev) => prev.filter((r) => r.id !== reaction.id)),
            3200
          );
        }
      )
      .on("presence", { event: "sync" }, () => {
        const others = Object.keys(channel.presenceState()).filter((k) => k !== me.id);
        setPartnerHere(others.length > 0);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ at: Date.now() });
      });

    return () => {
      sb.removeChannel(channel);
    };
  }, [kind, me.id, load]);

  // --- the YouTube player ---------------------------------------------------
  useEffect(() => {
    if (!isYouTube || !room?.track_ref || !mount.current) return;
    let cancelled = false;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !mount.current) return;

        if (player.current) {
          if (loadedRef.current !== room.track_ref) {
            loadedRef.current = room.track_ref;
            player.current.cueVideoById(room.track_ref!);
          }
          return;
        }

        loadedRef.current = room.track_ref;
        player.current = new YT.Player(mount.current, {
          videoId: room.track_ref!,
          playerVars: {
            playsinline: 1,
            controls: 0,
            modestbranding: 1,
            rel: 0,
            disablekb: 1,
          },
          events: {
            onReady: () => setReady(true),
            onStateChange: (e) => {
              if (e.data === YT_STATE.ENDED) advanceRef.current();
              if (e.data === YT_STATE.PLAYING) setNeedsTap(false);
            },
            onError: () =>
              setProblem("That video will not play embedded. Try a different link."),
          },
        });
      })
      .catch((e) => setProblem(e instanceof Error ? e.message : "Player failed to load"));

    return () => {
      cancelled = true;
    };
  }, [isYouTube, room?.track_ref]);

  useEffect(() => {
    return () => {
      player.current?.destroy();
      player.current = null;
    };
  }, []);

  // --- keeping in step ------------------------------------------------------
  useEffect(() => {
    if (!room?.track_ref) return;

    const tick = () => {
      const element = isYouTube ? player.current : media.current;
      if (!element) return;

      const target = targetPosition(room, offset, room.duration_ms);
      const actual = isYouTube
        ? (player.current!.getCurrentTime() ?? 0) * 1000
        : (media.current!.currentTime ?? 0) * 1000;

      setPosition(actual);

      const total = isYouTube
        ? (player.current!.getDuration() ?? 0) * 1000
        : (media.current!.duration ?? 0) * 1000;
      if (Number.isFinite(total) && total > 0) setDuration(total);

      if (room.playing) {
        // YouTube's playback rates are too coarse to nudge with, so it seeks.
        const correction = correctionFor(actual, target, !isYouTube, config.tolerance);

        if (correction.kind === "seek") {
          if (isYouTube) player.current!.seekTo(correction.to / 1000, true);
          else media.current!.currentTime = correction.to / 1000;
        } else if (correction.kind === "rate" && media.current) {
          media.current.playbackRate = correction.rate;
        } else if (media.current) {
          media.current.playbackRate = 1;
        }

        if (isYouTube) {
          const state = player.current!.getPlayerState();
          if (state !== YT_STATE.PLAYING && state !== YT_STATE.BUFFERING) {
            player.current!.playVideo();
            if (state === YT_STATE.UNSTARTED || state === YT_STATE.CUED) setNeedsTap(true);
          }
        } else if (media.current!.paused) {
          media.current!.play().catch(() => setNeedsTap(true));
        }
      } else {
        if (isYouTube) {
          if (player.current!.getPlayerState() === YT_STATE.PLAYING) {
            player.current!.pauseVideo();
          }
        } else if (!media.current!.paused) {
          media.current!.pause();
        }
      }
    };

    tick();
    const timer = setInterval(tick, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [room, offset, isYouTube, config.tolerance]);

  // Smooth progress between sync checks.
  useEffect(() => {
    if (!room?.playing) return;
    const timer = setInterval(() => setPosition((p) => p + 250), 250);
    return () => clearInterval(timer);
  }, [room?.playing]);

  // --- controls -------------------------------------------------------------
  const control = useCallback(
    async (playing: boolean, positionMs: number) => {
      setNeedsTap(false);
      const { data, error } = await supabaseBrowser().rpc("sync_control", {
        p_kind: kind,
        p_playing: playing,
        p_position_ms: Math.round(positionMs),
      });
      if (error) setProblem(error.message);
      else setSnapshot(data as SyncSnapshot);
    },
    [kind]
  );

  async function toggle() {
    if (!room) return;
    const now = targetPosition(room, offset, room.duration_ms);
    await control(!room.playing, room.playing ? now : position);

    if (!room.playing) {
      notifyPartner({
        title: me.display_name,
        body: room.title
          ? `started ${room.title}`
          : kind === "watch"
            ? "started watching"
            : "started listening",
        url: kind === "listen" ? "/listen" : "/watch",
        tag: kind,
      });
    }
  }

  async function seek(toMs: number) {
    if (!room) return;
    if (isYouTube) player.current?.seekTo(toMs / 1000, true);
    else if (media.current) media.current.currentTime = toMs / 1000;
    setPosition(toMs);
    await control(room.playing, toMs);
  }

  async function react(emoji: string) {
    if (!room?.track_key) return;
    navigator.vibrate?.(15);

    await supabaseBrowser().from("sync_reactions").insert({
      track_key: room.track_key,
      author_id: me.id,
      position_ms: Math.round(position),
      emoji,
    });
  }

  async function play(item: QueueItem) {
    const { data, error } = await supabaseBrowser().rpc("sync_set_track", {
      p_kind: kind,
      p_source: item.source,
      p_track_ref: item.track_ref,
      p_title: item.title,
      p_note: item.note,
      p_duration_ms: null,
      p_queue_id: item.id,
    });
    if (error) setProblem(error.message);
    else setSnapshot(data as SyncSnapshot);
  }

  function fullscreen() {
    const target = frame.current;
    if (!target) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else target.requestFullscreen?.().catch(() => setFlash("Fullscreen was refused"));
  }

  const mediaUrl = useSignedMedia(room?.source === "upload" ? room.track_ref : null);
  const total = room?.duration_ms || duration;
  const pending = snapshot?.queue ?? [];

  // Past reactions surfacing as the same moment comes round again.
  const nearby = useMemo(() => {
    if (!snapshot) return [];
    const live = new Set(floating.map((f) => f.id));
    return snapshot.reactions.filter(
      (r) => !live.has(r.id) && Math.abs(r.position_ms - position) < 2500
    );
  }, [snapshot, position, floating]);

  return (
    <>
      <header className="mb-4 flex items-baseline justify-between">
        <p className="label">{config.heading}</p>
        <span className={`text-[0.6875rem] ${partnerHere ? "text-ink" : "text-ink-faint"}`}>
          {partnerHere ? `${them} is here` : `${them} is not here`}
        </span>
      </header>

      {problem && <Problem message={problem} />}

      {!room?.track_ref ? (
        <div className="card mb-5 px-5 py-9 text-center">
          <p className="text-2xl">{kind === "watch" ? "📺" : "🎧"}</p>
          <p className="mt-2 text-sm font-medium">{config.emptyTitle}</p>
          <p className="mx-auto mt-1 max-w-[24rem] text-[0.8125rem] leading-relaxed text-ink-soft">
            {config.emptyBody}
          </p>
        </div>
      ) : (
        <div className="card mb-4 overflow-hidden">
          <div ref={frame} className="relative bg-black">
            <div className={config.showsPicture ? "aspect-video w-full" : "hidden"}>
              {isYouTube ? (
                <div ref={mount} className="h-full w-full" />
              ) : (
                mediaUrl && (
                  <video
                    ref={media}
                    src={mediaUrl}
                    playsInline
                    preload="auto"
                    className="h-full w-full"
                  />
                )
              )}
            </div>

            {/* Audio rooms still need the elements, just not on screen. */}
            {!config.showsPicture && (
              <div className="hidden">
                {isYouTube ? (
                  <div ref={mount} />
                ) : (
                  mediaUrl && <video ref={media} src={mediaUrl} preload="auto" />
                )}
              </div>
            )}

            {/* Live reactions drift over the picture. */}
            {config.showsPicture && floating.length > 0 && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-wrap justify-center gap-2 px-3">
                {floating.map((r) => (
                  <span
                    key={r.id}
                    className="rise rounded-full bg-black/60 px-3 py-1.5 text-lg backdrop-blur"
                  >
                    {r.emoji}
                  </span>
                ))}
              </div>
            )}

            {config.showsPicture && (
              <button
                onClick={fullscreen}
                aria-label="Fullscreen"
                className="press absolute right-2 top-2 rounded-full bg-black/55 px-2.5 py-1.5 text-xs text-white backdrop-blur"
              >
                ⛶
              </button>
            )}
          </div>

          <div className="px-4 py-3.5">
            <p className="text-sm font-semibold">{room.title ?? "Untitled"}</p>
            {room.note && (
              <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-soft">
                “{room.note}”
              </p>
            )}
            <p className="mt-0.5 text-[0.6875rem] text-ink-faint">
              added by {room.added_by === me.id ? "you" : them}
            </p>

            <ReactionTrack
              reactions={snapshot?.reactions ?? []}
              duration={total}
              position={position}
              meId={me.id}
              onSeek={seek}
            />

            <div className="flex items-center justify-between text-[0.6875rem] tabular-nums text-ink-faint">
              <span>{clock(position)}</span>
              <span>{total ? clock(total) : "—"}</span>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={toggle}
                disabled={isYouTube && !ready}
                aria-label={room.playing ? "Pause" : "Play"}
                className={`press accent-${me.accent} flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg disabled:opacity-40`}
                style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)" }}
              >
                {room.playing ? "❚❚" : "▶"}
              </button>

              <button
                onClick={advance}
                aria-label="Next"
                className="press rounded-full border border-line px-3.5 py-2.5 text-sm"
              >
                ⏭
              </button>

              <div className="flex flex-1 justify-end gap-1.5">
                {config.reactions.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => react(emoji)}
                    aria-label={`React ${emoji}`}
                    className="press text-xl"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {needsTap && (
              <p className="mt-3 rounded-xl border border-line bg-sunken px-3 py-2.5 text-[0.75rem] leading-relaxed text-ink-soft">
                Your browser will not start playback on its own. Tap play once and it stays
                in step from then on.
              </p>
            )}
          </div>
        </div>
      )}

      {nearby.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {nearby.map((r) => {
            const old = new Date(r.created_at).toDateString() !== new Date().toDateString();
            return (
              <span
                key={r.id}
                className={`rise accent-${r.author_id === me.id ? me.accent : (partner?.accent ?? "rose")} rounded-full border px-3 py-1.5 text-[0.75rem]`}
                style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}
              >
                {r.emoji}{" "}
                <span className="text-ink-soft">
                  {r.author_id === me.id ? "you" : them}
                  {old &&
                    `, ${new Date(r.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      year: "numeric",
                    })}`}
                </span>
              </span>
            );
          })}
        </div>
      )}

      <AddTrack kind={kind} me={me} onAdded={load} onFlash={setFlash} />

      <Section title={`${config.queueLabel}${pending.length ? ` · ${pending.length}` : ""}`}>
        {pending.length === 0 ? (
          <p className="px-1 text-[0.8125rem] text-ink-faint">
            Nothing queued. Paste a link above.
          </p>
        ) : (
          <div className="card overflow-hidden">
            {pending.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
              >
                <button onClick={() => play(item)} className="press min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium">{item.title ?? item.track_ref}</p>
                  <p className="truncate text-[0.6875rem] text-ink-faint">
                    {item.added_by === me.id ? "you" : them}
                    {item.note && ` · ${item.note}`}
                  </p>
                </button>
                <button
                  onClick={async () => {
                    await supabaseBrowser().from("sync_queue").delete().eq("id", item.id);
                    load();
                  }}
                  aria-label="Remove"
                  className="press shrink-0 text-[0.75rem] text-ink-faint"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Flash>{flash}</Flash>
    </>
  );
}

/** Signed URL for an uploaded file. */
function useSignedMedia(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    supabaseBrowser()
      .storage.from("media")
      .createSignedUrl(path, 7200)
      .then(({ data }) => {
        if (!cancelled) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return url;
}
