"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  EMOJI_CATEGORIES,
  loadRecent,
  rememberRecent,
  searchEmoji,
  type EmojiEntry,
} from "@/lib/emoji";

/**
 * A picker in the shape people already know: category tabs, a scrolling grid,
 * search, and recently used at the front.
 *
 * It stays open after a selection, because nobody sends exactly one emoji.
 */
export default function EmojiPicker({
  open,
  onPick,
  onClose,
}: {
  open: boolean;
  onPick: (char: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<string>("recent");
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const grid = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setRecent(loadRecent());
  }, [open]);

  // Land on something populated: recents on a return visit, smileys on a first.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setTab(loadRecent().length > 0 ? "recent" : "smileys");
  }, [open]);

  const results = useMemo(() => (query ? searchEmoji(query) : []), [query]);

  const shown: EmojiEntry[] = useMemo(() => {
    if (query) return results;
    if (tab === "recent") return recent.map((char) => ({ char, keywords: "" }));
    return EMOJI_CATEGORIES.find((c) => c.id === tab)?.emoji ?? [];
  }, [query, results, tab, recent]);

  function pick(char: string) {
    setRecent(rememberRecent(char));
    onPick(char);
  }

  if (!open) return null;

  return (
    <div className="mb-2 overflow-hidden rounded-2xl border border-line bg-raised">
      <div className="flex items-center gap-2 border-b border-line px-2.5 py-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emoji"
          className="!py-1.5 text-[0.8125rem]"
        />
        <button
          onClick={onClose}
          aria-label="Close emoji picker"
          className="press shrink-0 px-1.5 text-sm text-ink-faint"
        >
          ✕
        </button>
      </div>

      <div
        ref={grid}
        className="grid max-h-52 grid-cols-8 gap-0.5 overflow-y-auto p-2"
      >
        {shown.length === 0 ? (
          <p className="col-span-8 py-8 text-center text-[0.8125rem] text-ink-faint">
            {query ? "Nothing matches that" : "Nothing here yet"}
          </p>
        ) : (
          shown.map((entry, i) => (
            <button
              key={`${entry.char}-${i}`}
              onClick={() => pick(entry.char)}
              title={entry.keywords}
              aria-label={entry.keywords || entry.char}
              className="press flex aspect-square items-center justify-center rounded-lg text-[1.35rem] leading-none hover:bg-sunken"
            >
              {entry.char}
            </button>
          ))
        )}
      </div>

      {!query && (
        <div className="flex items-stretch gap-0.5 border-t border-line px-1.5 py-1">
          <Tab
            id="recent"
            icon="🕘"
            label="Recent"
            active={tab === "recent"}
            onPick={setTab}
          />
          {EMOJI_CATEGORIES.map((c) => (
            <Tab
              key={c.id}
              id={c.id}
              icon={c.icon}
              label={c.label}
              active={tab === c.id}
              onPick={(id) => {
                setTab(id);
                grid.current?.scrollTo({ top: 0 });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Tab({
  id,
  icon,
  label,
  active,
  onPick,
}: {
  id: string;
  icon: string;
  label: string;
  active: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onPick(id)}
      title={label}
      aria-label={label}
      aria-current={active ? "true" : undefined}
      className={`press flex-1 rounded-lg py-1.5 text-base leading-none transition-colors ${
        active ? "bg-sunken" : "opacity-45"
      }`}
    >
      {icon}
    </button>
  );
}
