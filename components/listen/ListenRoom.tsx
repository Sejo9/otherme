"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { notifyPartner } from "@/lib/push";
import {
  clock,
  correctionFor,
  measureClockOffset,
  targetPosition,
} from "@/lib/sync";
import { YT_STATE, loadYouTubeApi, type YTPlayer } from "@/lib/youtube";
import type { Profile } from "@/lib/types";
import { Flash, Problem, Section, SubNav, useFlash } from "@/components/ui";
import AddTrack from "./AddTrack";
import ReactionTrack from "./ReactionTrack";
import type { ListenSnapshot, QueueItem, Reaction } from "./types";
import { REACTIONS } from "./types";

/** How often we compare where we are to where we should be. */
const CHECK_EVERY_MS = 2000;

export default function ListenRoom({
  me,
  partner,
}: {
  me: Profile;
  partner: Profile | null;
}) {
  const them = partner?.display_name ?? "They";

  const [snapshot, setSnapshot] = useState<ListenSnapshot | null>(null);
  const [offset, setOffset] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();

  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [partnerHere, setPartnerHere] = useState(false);

  const mount = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const loadedRef = useRef<string | null>(null);

  const room = snapshot?.room ?? null;
  const isYouTube = room?.source === "youtube";

  // --- loading ------------------------------------------------------------
  const load = useCallback(async () => {
    const startedAt = Date.now();
    const { data, error } = await supabaseBrowser().rpc("listen_snapshot");
    const finishedAt = Date.now();

    if (error) {
      setProblem(error.message);
      return null;
    }

    const fresh = data as ListenSnapshot;
    setSnapshot(fresh);
    setOffset(measureClockOffset(fresh.server_now, startedAt, finishedAt));
    return fresh;
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // --- live -----------------------------------------------------------------
  useEffect(() => {
    const sb = supabaseBrowser();

    const channel = sb
      .channel("listen-room", { config: { presence: { key: me.id } } })
      .on("postgres_changes", { event: "*", schema: "public", table: "listen_room" }, () =>
        load()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "listen_queue" }, () =>
        load()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "listen_reactions" },
        ({ new: row }) => {
          const reaction = row as Reaction;
          setSnapshot((prev) =>
            prev && reaction.track_key === prev.room.track_key
              ? { ...prev, reactions: [...prev.reactions, reaction] }
              : prev
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
  }, [me.id, load]);

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
              if (e.data === YT_STATE.ENDED) advance();
              // Blocked autoplay shows up as staying unstarted while the room
              // says we should be playing.
              if (e.data === YT_STATE.PLAYING) setNeedsTap(false);
            },
            onError: () => setProblem("That video cannot be played embedded."),
          },
        });
      })
      .catch((e) => setProblem(e instanceof Error ? e.message : "Player failed to load"));

    return () => {
      cancelled = true;
    };
    // `advance` is stable enough for this; re-running on it would rebuild the
    // player on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const target = targetPosition(room, offset, room.duration_ms);

      const element = isYouTube ? player.current : audio.current;
      if (!element) return;

      const actual = isYouTube
        ? (player.current!.getCurrentTime() ?? 0) * 1000
        : (audio.current!.currentTime ?? 0) * 1000;

      setPosition(actual);

      const total = isYouTube
        ? (player.current!.getDuration() ?? 0) * 1000
        : (audio.current!.duration ?? 0) * 1000;
      if (Number.isFinite(total) && total > 0) setDuration(total);

      if (room.playing) {
        // YouTube only offers coarse playback rates, so it corrects by seeking.
        const correction = correctionFor(actual, target, !isYouTube);

        if (correction.kind === "seek") {
          if (isYouTube) player.current!.seekTo(correction.to / 1000, true);
          else audio.current!.currentTime = correction.to / 1000;
        } else if (correction.kind === "rate" && audio.current) {
          audio.current.playbackRate = correction.rate;
        } else if (audio.current) {
          audio.current.playbackRate = 1;
        }

        // Make sure we are actually rolling.
        if (isYouTube) {
          const state = player.current!.getPlayerState();
          if (state !== YT_STATE.PLAYING && state !== YT_STATE.BUFFERING) {
            player.current!.playVideo();
            if (state === YT_STATE.UNSTARTED || state === YT_STATE.CUED) setNeedsTap(true);
          }
        } else if (audio.current!.paused) {
          audio.current!.play().catch(() => setNeedsTap(true));
        }
      } else {
        if (isYouTube) {
          if (player.current!.getPlayerState() === YT_STATE.PLAYING) {
            player.current!.pauseVideo();
          }
        } else if (!audio.current!.paused) {
          audio.current!.pause();
        }
      }
    };

    tick();
    const timer = setInterval(tick, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [room, offset, isYouTube]);

  // Smooth progress bar between sync checks.
  useEffect(() => {
    if (!room?.playing) return;
    const timer = setInterval(() => setPosition((p) => p + 250), 250);
    return () => clearInterval(timer);
  }, [room?.playing]);

  // --- controls -------------------------------------------------------------
  const control = useCallback(
    async (playing: boolean, positionMs: number) => {
      setNeedsTap(false);
      const { data, error } = await supabaseBrowser().rpc("listen_control", {
        p_playing: playing,
        p_position_ms: Math.round(positionMs),
      });
      if (error) setProblem(error.message);
      else setSnapshot(data as ListenSnapshot);
    },
    []
  );

  const advance = useCallback(async () => {
    const { data, error } = await supabaseBrowser().rpc("listen_next");
    if (error) setProblem(error.message);
    else setSnapshot(data as ListenSnapshot);
  }, []);

  async function toggle() {
    if (!room) return;
    const now = targetPosition(room, offset, room.duration_ms);
    await control(!room.playing, room.playing ? now : position);

    if (!room.playing) {
      notifyPartner({
        title: me.display_name,
        body: room.title ? `is playing ${room.title}` : "started listening",
        url: "/listen",
        tag: "listen",
      });
    }
  }

  async function seek(toMs: number) {
    if (!room) return;
    if (isYouTube) player.current?.seekTo(toMs / 1000, true);
    else if (audio.current) audio.current.currentTime = toMs / 1000;
    setPosition(toMs);
    await control(room.playing, toMs);
  }

  async function react(emoji: string) {
    if (!room?.track_key) return;
    navigator.vibrate?.(15);

    await supabaseBrowser().from("listen_reactions").insert({
      track_key: room.track_key,
      author_id: me.id,
      position_ms: Math.round(position),
      emoji,
    });
  }

  async function play(item: QueueItem) {
    const { data, error } = await supabaseBrowser().rpc("listen_set_track", {
      p_source: item.source,
      p_track_ref: item.track_ref,
      p_title: item.title,
      p_note: item.note,
      p_duration_ms: null,
      p_queue_id: item.id,
    });
    if (error) setProblem(error.message);
    else setSnapshot(data as ListenSnapshot);
  }

  const total = room?.duration_ms || duration;
  const pending = snapshot?.queue ?? [];

  const audioUrl = useAudioUrl(
    room?.source === "upload" ? room.track_ref : null
  );

  const nearby = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.reactions.filter(
      (r) => Math.abs(r.position_ms - position) < 2500
    );
  }, [snapshot, position]);

  return (
    <>
      <SubNav
        current="/listen"
        items={[
          { href: "/timeline", label: "Timeline" },
          { href: "/map", label: "Map" },
          { href: "/listen", label: "Listen" },
        ]}
      />

      <header className="mb-4">
        <div className="flex items-baseline justify-between">
          <p className="label">Listening together</p>
          <span
            className={`text-[0.6875rem] ${partnerHere ? "text-ink" : "text-ink-faint"}`}
          >
            {partnerHere ? `${them} is here` : `${them} is not listening`}
          </span>
        </div>
      </header>

      {problem && <Problem message={problem} />}

      {!room?.track_ref ? (
        <div className="card mb-5 px-5 py-9 text-center">
          <p className="text-2xl">🎧</p>
          <p className="mt-2 text-sm font-medium">Nothing playing</p>
          <p className="mx-auto mt-1 max-w-[22rem] text-[0.8125rem] leading-relaxed text-ink-soft">
            Put a song on and it starts on both your phones at the same moment. Whoever
            is not here yet will land in the right place when they open it.
          </p>
        </div>
      ) : (
        <div className="card mb-4 overflow-hidden">
          {/* The video is small on purpose: this is for listening. */}
          <div className={isYouTube ? "aspect-video w-full bg-black" : "hidden"}>
            <div ref={mount} className="h-full w-full" />
          </div>

          {room.source === "upload" && audioUrl && (
            <audio ref={audio} src={audioUrl} preload="auto" className="hidden" />
          )}

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

            <div className="mt-1 flex items-center justify-between text-[0.6875rem] tabular-nums text-ink-faint">
              <span>{clock(position)}</span>
              <span>{total ? clock(total) : "—"}</span>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={toggle}
                disabled={!ready && isYouTube}
                aria-label={room.playing ? "Pause" : "Play"}
                className={`press flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg disabled:opacity-40 accent-${me.accent}`}
                style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)" }}
              >
                {room.playing ? "❚❚" : "▶"}
              </button>

              <button
                onClick={advance}
                className="press rounded-full border border-line px-3.5 py-2.5 text-sm"
                aria-label="Next track"
              >
                ⏭
              </button>

              <div className="flex flex-1 justify-end gap-1.5">
                {REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => react(emoji)}
                    className="press text-xl"
                    aria-label={`React ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {needsTap && (
              <p className="mt-3 rounded-xl border border-line bg-sunken px-3 py-2.5 text-[0.75rem] leading-relaxed text-ink-soft">
                Your browser will not start audio on its own. Tap play once and it stays
                in step from then on.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Reactions surfacing as they come round again. */}
      {nearby.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {nearby.map((r) => (
            <span
              key={r.id}
              className={`rise accent-${r.author_id === me.id ? me.accent : (partner?.accent ?? "rose")} rounded-full border px-3 py-1.5 text-[0.75rem]`}
              style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}
            >
              {r.emoji}{" "}
              <span className="text-ink-soft">
                {r.author_id === me.id ? "you" : them}
                {new Date(r.created_at).toDateString() !== new Date().toDateString() &&
                  `, ${new Date(r.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`}
              </span>
            </span>
          ))}
        </div>
      )}

      <AddTrack me={me} onAdded={load} onFlash={setFlash} />

      <Section title={`Up next${pending.length ? ` · ${pending.length}` : ""}`}>
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
                    await supabaseBrowser().from("listen_queue").delete().eq("id", item.id);
                    load();
                  }}
                  className="press shrink-0 text-[0.75rem] text-ink-faint"
                  aria-label="Remove"
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

/** Signed URL for an uploaded track. */
function useAudioUrl(path: string | null | undefined): string | null {
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
