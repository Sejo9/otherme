"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { notifyPartner } from "@/lib/push";
import { ago } from "@/lib/day";
import { connect4Initial, reversiInitial } from "@/lib/games";
import { GAMES, type Game, type GameKind, type GameRecord, type Profile } from "@/lib/types";
import { Empty, Problem, Section, SubNav } from "@/components/ui";
import GameBoard from "./GameBoard";

export default function GamesLobby({
  me,
  partner,
}: {
  me: Profile;
  partner: Profile | null;
}) {
  const [games, setGames] = useState<Game[]>([]);
  const [record, setRecord] = useState<GameRecord[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const [{ data, error }, { data: rec }] = await Promise.all([
      sb.from("games").select("*").order("updated_at", { ascending: false }).limit(50),
      sb.rpc("game_record"),
    ]);

    if (error) setProblem(error.message);
    setGames((data ?? []) as Game[]);
    setRecord((rec ?? []) as GameRecord[]);
  }, []);

  useEffect(() => {
    load();
    const channel = supabaseBrowser()
      .channel("games-lobby")
      .on("postgres_changes", { event: "*", schema: "public", table: "games" }, () => load())
      .subscribe();
    return () => {
      supabaseBrowser().removeChannel(channel);
    };
  }, [load]);

  async function start(kind: GameKind) {
    if (!partner || starting) return;
    setStarting(true);
    setProblem(null);

    // Whoever starts takes seat 1 and moves first.
    const state = {
      board: kind === "connect4" ? connect4Initial() : reversiInitial(),
      seats: { 1: me.id, 2: partner.id },
    };

    const { data, error } = await supabaseBrowser()
      .from("games")
      .insert({ kind, state, turn: me.id, started_by: me.id })
      .select()
      .single();

    setStarting(false);
    if (error) {
      setProblem(error.message);
      return;
    }

    notifyPartner({
      title: me.display_name,
      body: `started a game of ${GAMES[kind].name.toLowerCase()}`,
      url: "/games",
      tag: "game-new",
    });

    setOpenId((data as Game).id);
    load();
  }

  const open = games.find((g) => g.id === openId);
  if (open) {
    return (
      <GameBoard game={open} me={me} partner={partner} onExit={() => setOpenId(null)} />
    );
  }

  const active = games.filter((g) => g.status === "active");
  const finished = games.filter((g) => g.status !== "active");
  const yourMove = active.filter((g) => g.turn === me.id);

  return (
    <>
      <header className="mb-5 pt-2">
        <p className="label">Against each other</p>
        <h1 className="mt-0.5 font-serif text-[1.75rem]">Games</h1>
        <p className="mt-1 text-[0.8125rem] text-ink-soft">
          {yourMove.length > 0
            ? `${yourMove.length} waiting on you`
            : active.length > 0
              ? `${active.length} in progress`
              : "Nothing on the go."}
        </p>
      </header>

      <SubNav
        current="/games"
        items={[
          { href: "/games", label: "Games" },
          { href: "/knowme", label: "Know me" },
        ]}
      />

      {problem && <Problem message={problem} />}

      <Section title="Start something">
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(GAMES) as GameKind[]).map((kind) => (
            <button
              key={kind}
              onClick={() => start(kind)}
              disabled={!partner || starting}
              className="press card flex flex-col gap-1 px-3.5 py-3.5 text-left disabled:opacity-50"
            >
              <span className="text-xl">{GAMES[kind].icon}</span>
              <span className="text-sm font-medium">{GAMES[kind].name}</span>
              <span className="text-[0.6875rem] leading-snug text-ink-faint">
                {GAMES[kind].blurb}
              </span>
              <Record record={record} kind={kind} me={me} partner={partner} />
            </button>
          ))}
        </div>
      </Section>

      <Section title="In progress">
        {active.length === 0 ? (
          <Empty>No game running. Start one above — there is no clock.</Empty>
        ) : (
          <div className="card overflow-hidden">
            {active.map((game) => (
              <Row
                key={game.id}
                game={game}
                me={me}
                partner={partner}
                onOpen={() => setOpenId(game.id)}
              />
            ))}
          </div>
        )}
      </Section>

      {finished.length > 0 && (
        <Section title="Finished">
          <div className="card overflow-hidden">
            {finished.slice(0, 12).map((game) => (
              <Row
                key={game.id}
                game={game}
                me={me}
                partner={partner}
                onOpen={() => setOpenId(game.id)}
              />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

function Record({
  record,
  kind,
  me,
  partner,
}: {
  record: GameRecord[];
  kind: GameKind;
  me: Profile;
  partner: Profile | null;
}) {
  const mine = record.find((r) => r.kind === kind && r.user_id === me.id);
  const theirs = record.find((r) => r.kind === kind && r.user_id !== me.id);
  if (!mine && !theirs) return null;

  return (
    <span className="mt-1 text-[0.6875rem] tabular-nums text-ink-faint">
      {mine?.wins ?? 0}–{theirs?.wins ?? 0}
      {(mine?.draws ?? 0) > 0 && ` · ${mine?.draws} drawn`}
    </span>
  );
}

function Row({
  game,
  me,
  partner,
  onOpen,
}: {
  game: Game;
  me: Profile;
  partner: Profile | null;
  onOpen: () => void;
}) {
  const theirName = partner?.display_name ?? "Them";
  const yourMove = game.turn === me.id && game.status === "active";

  const label =
    game.status === "active"
      ? yourMove
        ? "Your move"
        : `Waiting on ${theirName}`
      : game.status === "draw"
        ? "Drawn"
        : game.winner === me.id
          ? "You won"
          : `${theirName} won`;

  return (
    <button
      onClick={onOpen}
      className="press flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-left last:border-b-0"
    >
      <span className="text-base">{GAMES[game.kind].icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{GAMES[game.kind].name}</p>
        <p className="text-[0.6875rem] text-ink-faint">
          {label} · {ago(game.updated_at)}
        </p>
      </div>
      {yourMove && (
        <span className="shrink-0 rounded-full bg-ink px-2.5 py-1 text-[0.6875rem] font-medium text-bg">
          Play
        </span>
      )}
    </button>
  );
}
