"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uploadImage } from "@/lib/media";
import { notifyPartner } from "@/lib/push";
import { prettyDay, localDay } from "@/lib/day";
import type { Profile } from "@/lib/types";
import { Problem } from "@/components/ui";
import Bubble from "./Bubble";
import { groupByDay, isContinuation, type ChatRead, type Message } from "./types";

const PAGE = 60;

export default function Chat({
  me,
  partner,
}: {
  me: Profile;
  partner: Profile | null;
}) {
  const them = partner?.display_name ?? "Them";

  const [messages, setMessages] = useState<Message[]>([]);
  const [reads, setReads] = useState<ChatRead[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [theyAreTyping, setTheyAreTyping] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const bottom = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingChannel = useRef<ReturnType<
    ReturnType<typeof supabaseBrowser>["channel"]
  > | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stickToBottom = useRef(true);

  const load = useCallback(async () => {
    const [{ data, error }, { data: readRows }] = await Promise.all([
      supabaseBrowser()
        .from("messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(PAGE),
      supabaseBrowser().from("chat_reads").select("*"),
    ]);

    if (error) setProblem(error.message);
    setMessages(((data ?? []) as Message[]).reverse());
    setReads((readRows ?? []) as ChatRead[]);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Mark read on arrival and whenever the window regains focus.
  const markRead = useCallback(async () => {
    await supabaseBrowser().rpc("chat_mark_read");
  }, []);

  useEffect(() => {
    if (!loaded) return;
    markRead();

    const onFocus = () => document.visibilityState === "visible" && markRead();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [loaded, markRead]);

  useEffect(() => {
    const sb = supabaseBrowser();

    const channel = sb
      .channel("chat")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        ({ new: row }) => {
          const message = row as Message;
          setMessages((prev) =>
            prev.some((m) => m.id === message.id) ? prev : [...prev, message]
          );
          if (message.author_id !== me.id) {
            setTheyAreTyping(false);
            if (document.visibilityState === "visible") markRead();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        ({ new: row }) => {
          const message = row as Message;
          setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
        }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reads" }, () => {
        sb.from("chat_reads")
          .select("*")
          .then(({ data }) => setReads((data ?? []) as ChatRead[]));
      })
      // Typing is ephemeral — broadcast, never stored.
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if ((payload as { from?: string })?.from === me.id) return;
        setTheyAreTyping(true);
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTheyAreTyping(false), 3500);
      })
      .subscribe();

    typingChannel.current = channel;

    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      sb.removeChannel(channel);
      typingChannel.current = null;
    };
  }, [me.id, markRead]);

  // Follow new messages, but never yank the view while they are reading back.
  useEffect(() => {
    if (stickToBottom.current) {
      bottom.current?.scrollIntoView({ behavior: loaded ? "smooth" : "auto" });
    }
  }, [messages, theyAreTyping, loaded]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  function announceTyping() {
    typingChannel.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { from: me.id },
    });
  }

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setDraft("");
    const reply = replyTo;
    setReplyTo(null);
    stickToBottom.current = true;

    const { error } = await supabaseBrowser().from("messages").insert({
      author_id: me.id,
      body,
      reply_to: reply?.id ?? null,
    });

    setSending(false);
    if (error) {
      setProblem(error.message);
      setDraft(body); // give it back rather than losing it
      return;
    }

    notifyPartner({
      title: me.display_name,
      body: body.length > 120 ? `${body.slice(0, 117)}…` : body,
      url: "/chat",
      tag: "chat",
    });
  }

  async function sendPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setSending(true);
    stickToBottom.current = true;

    try {
      const path = await uploadImage(file, `chat/${me.id}`);
      const { error } = await supabaseBrowser().from("messages").insert({
        author_id: me.id,
        media_path: path,
        body: draft.trim() || null,
        reply_to: replyTo?.id ?? null,
      });
      if (error) throw error;

      setDraft("");
      setReplyTo(null);
      notifyPartner({
        title: me.display_name,
        body: "sent a photo",
        url: "/chat",
        tag: "chat",
      });
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not send that photo.");
    } finally {
      setSending(false);
    }
  }

  async function remove(message: Message) {
    await supabaseBrowser()
      .from("messages")
      .update({ deleted_at: new Date().toISOString(), body: null, media_path: null })
      .eq("id", message.id);
  }

  const byId = useMemo(
    () => new Map(messages.map((m) => [m.id, m])),
    [messages]
  );
  const groups = useMemo(() => groupByDay(messages), [messages]);

  // Their marker tells us the last thing of ours they have seen.
  const theirRead = reads.find((r) => r.user_id !== me.id)?.last_read_at;
  const lastSeenMine = useMemo(() => {
    if (!theirRead) return null;
    const seen = messages.filter(
      (m) => m.author_id === me.id && m.created_at <= theirRead
    );
    return seen[seen.length - 1]?.id ?? null;
  }, [messages, theirRead, me.id]);

  return (
    <div className="flex h-[calc(100dvh-9rem)] flex-col">
      <header className="mb-2 flex shrink-0 items-baseline justify-between">
        <h1 className="font-serif text-[1.5rem]">{them}</h1>
        {theyAreTyping && (
          <span className="text-[0.6875rem] text-ink-faint">typing…</span>
        )}
      </header>

      {problem && <Problem message={problem} />}

      <div
        ref={scroller}
        onScroll={onScroll}
        className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1"
      >
        {loaded && messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p className="text-2xl">💬</p>
            <p className="mt-2 text-sm font-medium">Nothing here yet</p>
            <p className="mt-1 max-w-[20rem] text-[0.8125rem] leading-relaxed text-ink-soft">
              Everywhere else in this app makes you wait for each other. Here you can just
              say the thing.
            </p>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.day}>
            <p className="sticky top-0 z-[1] py-2 text-center text-[0.6875rem] text-ink-faint">
              <span className="rounded-full bg-bg px-2.5 py-1">
                {group.day === localDay() ? "Today" : prettyDay(group.day)}
              </span>
            </p>

            {group.messages.map((message, i) => (
              <Bubble
                key={message.id}
                message={message}
                repliedTo={message.reply_to ? (byId.get(message.reply_to) ?? null) : null}
                mine={message.author_id === me.id}
                author={message.author_id === me.id ? me : partner}
                continuation={isContinuation(message, group.messages[i - 1])}
                showSeen={message.id === lastSeenMine}
                onReply={setReplyTo}
                onDelete={remove}
              />
            ))}
          </div>
        ))}

        <div ref={bottom} />
      </div>

      {/* --- composer --- */}
      <div className="shrink-0 pt-2">
        {replyTo && (
          <div className="mb-1.5 flex items-center gap-2 rounded-xl border border-line bg-sunken px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-[0.75rem] text-ink-soft">
              Replying to {replyTo.body ?? "photo"}
            </span>
            <button
              onClick={() => setReplyTo(null)}
              aria-label="Cancel reply"
              className="press text-[0.75rem] text-ink-faint"
            >
              ✕
            </button>
          </div>
        )}

        <div className={`accent-${me.accent} flex items-end gap-2`}>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={sending}
            aria-label="Send a photo"
            className="press mb-0.5 shrink-0 rounded-full border border-line px-3 py-2.5 text-sm disabled:opacity-40"
          >
            ＋
          </button>

          <textarea
            rows={1}
            value={draft}
            placeholder="Say something"
            onChange={(e) => {
              setDraft(e.target.value);
              announceTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            className="max-h-32 min-h-[2.75rem] resize-none"
          />

          <button
            onClick={send}
            disabled={!draft.trim() || sending}
            aria-label="Send"
            className="press mb-0.5 shrink-0 rounded-full px-4 py-2.5 text-sm font-medium disabled:opacity-40"
            style={{ background: "var(--accent)", color: "var(--bg)" }}
          >
            ↑
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={sendPhoto}
          className="hidden"
        />
      </div>
    </div>
  );
}
