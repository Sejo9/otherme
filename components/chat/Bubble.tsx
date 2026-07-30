"use client";

import { useState } from "react";
import { useSignedUrl } from "@/lib/media";
import type { Profile } from "@/lib/types";
import { useBackDismiss } from "@/components/ui";
import { canEdit, type Message } from "./types";

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function Bubble({
  message,
  repliedTo,
  mine,
  author,
  continuation,
  showSeen,
  meId,
  onReply,
  onEdit,
  onDelete,
}: {
  message: Message;
  repliedTo: Message | null;
  mine: boolean;
  author: Profile | null;
  continuation: boolean;
  showSeen: boolean;
  meId: string;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (message: Message) => void;
}) {
  const url = useSignedUrl(message.media_path);
  const [menu, setMenu] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  useBackDismiss(lightbox, () => setLightbox(false));

  if (message.deleted_at) {
    return (
      <div className={`flex ${mine ? "justify-end" : "justify-start"} ${continuation ? "mt-0.5" : "mt-2.5"}`}>
        <p className="rounded-2xl border border-dashed border-line px-3.5 py-2 text-[0.8125rem] italic text-ink-faint">
          {mine ? "You removed this" : "Removed"}
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        className={`flex flex-col ${mine ? "items-end" : "items-start"} ${
          continuation ? "mt-0.5" : "mt-2.5"
        }`}
      >
        <div
          className={`accent-${author?.accent ?? "amber"} group relative max-w-[85%]`}
          onDoubleClick={() => onReply(message)}
        >
          <button
            onClick={() => setMenu((m) => !m)}
            className="block w-full text-left"
            aria-label="Message options"
          >
            <div
              className="overflow-hidden rounded-2xl"
              style={{
                background: mine ? "var(--accent-soft)" : "var(--bg-raised)",
                border: `1px solid ${mine ? "var(--accent)" : "var(--line)"}`,
                borderBottomRightRadius: mine && !continuation ? "0.4rem" : undefined,
                borderBottomLeftRadius: !mine && !continuation ? "0.4rem" : undefined,
              }}
            >
              {repliedTo && (
                <div
                  className="border-l-2 bg-sunken px-3 py-1.5"
                  style={{ borderColor: "var(--accent)" }}
                >
                  <p className="line-clamp-2 text-[0.75rem] leading-snug text-ink-soft">
                    {repliedTo.deleted_at
                      ? "removed"
                      : (repliedTo.body ?? "📷 photo")}
                  </p>
                </div>
              )}

              {url && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightbox(true);
                  }}
                  className="block"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={message.body ?? "Photo"}
                    className="max-h-72 w-full object-cover"
                  />
                </span>
              )}

              {message.body && (
                <p className="whitespace-pre-wrap px-3.5 py-2 text-[0.9375rem] leading-relaxed">
                  {message.body}
                </p>
              )}
            </div>
          </button>

          {menu && (
            <div
              className={`absolute z-10 mt-1 flex gap-1 rounded-full border border-line bg-raised px-1.5 py-1 shadow-lg ${
                mine ? "right-0" : "left-0"
              }`}
            >
              <button
                onClick={() => {
                  onReply(message);
                  setMenu(false);
                }}
                className="press rounded-full px-2.5 py-1 text-[0.75rem]"
              >
                Reply
              </button>
              {canEdit(message, meId) && (
                <button
                  onClick={() => {
                    onEdit(message);
                    setMenu(false);
                  }}
                  className="press rounded-full px-2.5 py-1 text-[0.75rem]"
                >
                  Edit
                </button>
              )}
              {message.body && (
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(message.body!);
                    setMenu(false);
                  }}
                  className="press rounded-full px-2.5 py-1 text-[0.75rem]"
                >
                  Copy
                </button>
              )}
              {mine && (
                <button
                  onClick={() => {
                    onDelete(message);
                    setMenu(false);
                  }}
                  className="press rounded-full px-2.5 py-1 text-[0.75rem] text-rose"
                >
                  Remove
                </button>
              )}
            </div>
          )}
        </div>

        {!continuation && (
          <p className="mt-0.5 px-1 text-[0.625rem] text-ink-faint">
            {time(message.created_at)}
            {message.edited_at && " · edited"}
            {showSeen && " · seen"}
          </p>
        )}
      </div>

      {lightbox && url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </>
  );
}
