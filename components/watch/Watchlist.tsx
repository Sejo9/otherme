"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { notifyPartner } from "@/lib/push";
import { parseYouTubeId } from "@/lib/youtube";
import type { Profile } from "@/lib/types";
import { Button, Empty, Flash, Problem, Section, Sheet, useFlash } from "@/components/ui";

type Status = "want" | "watching" | "watched";

type Item = {
  id: string;
  added_by: string;
  title: string;
  source: "youtube" | "upload" | null;
  track_ref: string | null;
  where_to_watch: string | null;
  url: string | null;
  note: string | null;
  status: Status;
  watched_at: string | null;
  created_at: string;
};

type Rating = { item_id: string; user_id: string; stars: number; note: string | null };

const TABS: { id: Status; label: string }[] = [
  { id: "want", label: "Want to" },
  { id: "watching", label: "Watching" },
  { id: "watched", label: "Watched" },
];

/**
 * The watchlist.
 *
 * It deliberately accepts things this app cannot play. Most of what a couple
 * actually watches lives behind DRM that exposes no playback position, so
 * synchronising it is impossible — but *deciding* what to watch together is
 * not, and that is most of the friction anyway.
 */
export default function Watchlist({
  me,
  partner,
}: {
  me: Profile;
  partner: Profile | null;
}) {
  const them = partner?.display_name ?? "Them";

  const [items, setItems] = useState<Item[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [tab, setTab] = useState<Status>("want");
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<Item | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();

  const [title, setTitle] = useState("");
  const [where, setWhere] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data, error }, { data: rated }] = await Promise.all([
      supabaseBrowser()
        .from("watch_list")
        .select("*")
        .order("created_at", { ascending: false }),
      supabaseBrowser().from("watch_ratings").select("item_id, user_id, stars, note"),
    ]);

    if (error) setProblem(error.message);
    setItems((data ?? []) as Item[]);
    setRatings((rated ?? []) as Rating[]);
  }, []);

  useEffect(() => {
    load();
    const sb = supabaseBrowser();
    const channel = sb
      .channel("watchlist")
      .on("postgres_changes", { event: "*", schema: "public", table: "watch_list" }, () =>
        load()
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [load]);

  async function add() {
    if (!title.trim() || busy) return;
    setBusy(true);
    setProblem(null);

    // A YouTube link makes it playable in the room; anything else is still
    // worth keeping, it just cannot be synchronised.
    const videoId = url.trim() ? parseYouTubeId(url.trim()) : null;

    const { error } = await supabaseBrowser().from("watch_list").insert({
      added_by: me.id,
      title: title.trim(),
      source: videoId ? "youtube" : null,
      track_ref: videoId,
      where_to_watch: where.trim() || (videoId ? "YouTube" : null),
      url: url.trim() || null,
      note: note.trim() || null,
    });

    setBusy(false);
    if (error) {
      setProblem(error.message);
      return;
    }

    notifyPartner({
      title: me.display_name,
      body: `added ${title.trim()} to your watchlist`,
      url: "/watch",
      tag: "watchlist",
    });

    setTitle("");
    setWhere("");
    setUrl("");
    setNote("");
    setAdding(false);
    setFlash("Added");
    load();
  }

  async function setStatus(item: Item, status: Status) {
    await supabaseBrowser()
      .from("watch_list")
      .update({
        status,
        watched_at: status === "watched" ? new Date().toISOString() : null,
      })
      .eq("id", item.id);
    load();
  }

  async function rate(item: Item, stars: number) {
    await supabaseBrowser()
      .from("watch_ratings")
      .upsert(
        { item_id: item.id, user_id: me.id, stars },
        { onConflict: "item_id,user_id" }
      );
    load();
    setFlash("Rated");
  }

  /** Settles the "what shall we watch" stalemate. */
  function pickForTonight() {
    const candidates = items.filter((i) => i.status === "want");
    if (candidates.length === 0) {
      setFlash("Nothing on the list yet");
      return;
    }
    const choice = candidates[Math.floor(Math.random() * candidates.length)];
    setPicked(choice);
    navigator.vibrate?.([20, 40, 20]);
  }

  async function playHere(item: Item) {
    if (!item.source || !item.track_ref) return;
    const { error } = await supabaseBrowser().rpc("sync_set_track", {
      p_kind: "watch",
      p_source: item.source,
      p_track_ref: item.track_ref,
      p_title: item.title,
      p_note: item.note,
      p_duration_ms: null,
      p_queue_id: null,
    });
    if (error) setProblem(error.message);
    else {
      setStatus(item, "watching");
      setPicked(null);
      setFlash("On the screen");
    }
  }

  const shown = items.filter((i) => i.status === tab);

  return (
    <>
      <Section
        title="Watchlist"
        action={
          <button onClick={() => setAdding(true)} className="text-[0.75rem] underline">
            Add
          </button>
        }
      >
        {problem && <Problem message={problem} />}

        <div className="mb-3 flex gap-1 rounded-full border border-line bg-sunken p-1">
          {TABS.map((t) => {
            const count = items.filter((i) => i.status === t.id).length;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`press flex-1 rounded-full px-3 py-1.5 text-center text-[0.8125rem] font-medium ${
                  tab === t.id ? "bg-ink text-bg" : "text-ink-soft"
                }`}
              >
                {t.label}
                {count > 0 && <span className="ml-1 opacity-60">{count}</span>}
              </button>
            );
          })}
        </div>

        {tab === "want" && items.some((i) => i.status === "want") && (
          <Button variant="quiet" onClick={pickForTonight} className="mb-3 w-full">
            🎲 Pick one for tonight
          </Button>
        )}

        {shown.length === 0 ? (
          <Empty>
            {tab === "want"
              ? "Nothing on the list. Add whatever you keep meaning to watch — it does not have to be something this app can play."
              : tab === "watching"
                ? "Nothing part-watched."
                : "Nothing finished yet."}
          </Empty>
        ) : (
          <div className="card overflow-hidden">
            {shown.map((item) => (
              <Row
                key={item.id}
                item={item}
                me={me}
                them={them}
                ratings={ratings.filter((r) => r.item_id === item.id)}
                onStatus={setStatus}
                onRate={rate}
                onPlay={playHere}
              />
            ))}
          </div>
        )}
      </Section>

      {/* --- add --- */}
      <Sheet open={adding} onClose={() => setAdding(false)} title="Add to the watchlist">
        <div className={`accent-${me.accent} flex flex-col gap-3 pb-2`}>
          <input
            type="text"
            autoFocus
            placeholder="What is it?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            type="text"
            placeholder="Where is it? (Netflix, cinema, the shelf…)"
            value={where}
            onChange={(e) => setWhere(e.target.value)}
          />
          <input
            type="url"
            inputMode="url"
            placeholder="Link (optional — a YouTube link becomes playable here)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <textarea
            rows={2}
            placeholder="Why do you want to watch it?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button onClick={add} disabled={!title.trim() || busy} className="w-full py-3">
            {busy ? "…" : "Add it"}
          </Button>
        </div>
      </Sheet>

      {/* --- tonight's pick --- */}
      <Sheet open={!!picked} onClose={() => setPicked(null)} title="Tonight, then">
        {picked && (
          <div className="pb-2 text-center">
            <p className="text-3xl">🎲</p>
            <p className="mt-2 font-serif text-xl">{picked.title}</p>
            {picked.where_to_watch && (
              <p className="mt-1 text-[0.8125rem] text-ink-soft">on {picked.where_to_watch}</p>
            )}
            {picked.note && (
              <p className="mt-2 text-[0.8125rem] italic text-ink-soft">“{picked.note}”</p>
            )}

            <div className="mt-5 flex flex-col gap-2">
              {picked.source && picked.track_ref ? (
                <Button onClick={() => playHere(picked)} className="w-full py-3">
                  Put it on here
                </Button>
              ) : (
                picked.url && (
                  <a
                    href={picked.url}
                    target="_blank"
                    rel="noreferrer"
                    className="press rounded-[0.875rem] bg-ink px-4 py-3 text-sm font-medium text-bg"
                  >
                    Open it
                  </a>
                )
              )}
              <button
                onClick={pickForTonight}
                className="py-2 text-sm text-ink-faint underline"
              >
                Roll again
              </button>
            </div>
          </div>
        )}
      </Sheet>

      <Flash>{flash}</Flash>
    </>
  );
}

function Row({
  item,
  me,
  them,
  ratings,
  onStatus,
  onRate,
  onPlay,
}: {
  item: Item;
  me: Profile;
  them: string;
  ratings: Rating[];
  onStatus: (item: Item, status: Status) => void;
  onRate: (item: Item, stars: number) => void;
  onPlay: (item: Item) => void;
}) {
  const mine = ratings.find((r) => r.user_id === me.id);
  const theirs = ratings.find((r) => r.user_id !== me.id);

  return (
    <div className="border-b border-line px-4 py-3.5 last:border-b-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{item.title}</p>
          <p className="text-[0.6875rem] text-ink-faint">
            {item.where_to_watch ?? "somewhere"} · added by{" "}
            {item.added_by === me.id ? "you" : them}
          </p>
          {item.note && (
            <p className="mt-1 text-[0.8125rem] leading-snug text-ink-soft">“{item.note}”</p>
          )}
        </div>

        {item.source && item.track_ref ? (
          <button
            onClick={() => onPlay(item)}
            className="press shrink-0 rounded-full bg-ink px-2.5 py-1 text-[0.6875rem] font-medium text-bg"
          >
            Play
          </button>
        ) : (
          item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="press shrink-0 rounded-full border border-line px-2.5 py-1 text-[0.6875rem] text-ink-soft"
            >
              Open
            </a>
          )
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {item.status !== "watched" && (
          <button
            onClick={() => onStatus(item, "watched")}
            className="pill press text-ink-soft"
          >
            Mark watched
          </button>
        )}
        {item.status === "watched" && (
          <>
            <Stars value={mine?.stars ?? 0} onPick={(n) => onRate(item, n)} />
            {theirs && (
              <span className="text-[0.6875rem] text-ink-faint">
                {them}: {"★".repeat(theirs.stars)}
              </span>
            )}
          </>
        )}
        {item.status === "watched" && (
          <button
            onClick={() => onStatus(item, "want")}
            className="text-[0.6875rem] text-ink-faint underline"
          >
            Watch again
          </button>
        )}
      </div>
    </div>
  );
}

function Stars({ value, onPick }: { value: number; onPick: (n: number) => void }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => onPick(n)}
          aria-label={`${n} stars`}
          className="press text-sm"
          style={{ color: n <= value ? "var(--amber)" : "var(--ink-faint)" }}
        >
          ★
        </button>
      ))}
    </span>
  );
}
