"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Segmented control for sibling pages. The bottom bar only has five slots, so
 * closely-related screens share one slot and switch here.
 *
 * These are `Link`s, not anchors — a raw <a> triggers a full document
 * navigation, which meant re-downloading the app and re-authenticating on
 * every tap. They also `replace`, because switching between siblings is not a
 * step you should have to walk back through.
 */
export function SubNav({
  items,
  current,
}: {
  items: { href: string; label: string }[];
  current: string;
}) {
  return (
    <div className="mb-4 flex gap-1 rounded-full border border-line bg-sunken p-1">
      {items.map((item) => {
        const active = item.href === current;
        return (
          <Link
            key={item.href}
            href={item.href}
            replace
            prefetch
            className={`press flex-1 rounded-full px-3 py-1.5 text-center text-[0.8125rem] font-medium transition-colors ${
              active ? "bg-ink text-bg" : "text-ink-soft"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Makes the hardware/browser back gesture close an overlay instead of leaving
 * the page — what every native app does, and what people expect from anything
 * installed to a home screen.
 *
 * Opening pushes a throwaway history entry; back pops it and closes. Closing
 * by any other means removes the entry again so history stays clean.
 */
export function useBackDismiss(open: boolean, onClose: () => void) {
  const latest = useRef(onClose);
  latest.current = onClose;
  const pushed = useRef(false);

  useEffect(() => {
    if (!open) return;

    window.history.pushState({ overlay: true }, "");
    pushed.current = true;

    const onPop = () => {
      pushed.current = false; // the entry is already gone
      latest.current();
    };

    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed via the UI rather than the back gesture: drop our entry so the
      // next back press does not simply reopen nothing.
      if (pushed.current) {
        pushed.current = false;
        window.history.back();
      }
    };
  }, [open]);
}

export function Section({
  title,
  action,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      {(title || action) && (
        <div className="mb-2 flex items-baseline justify-between px-1">
          {title && <h2 className="label">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({
  variant = "solid",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "quiet" | "ghost";
}) {
  const styles = {
    solid: "bg-ink text-bg",
    quiet: "bg-sunken text-ink border border-line",
    ghost: "text-ink-soft",
  }[variant];

  return (
    <button
      {...props}
      className={`press rounded-[0.875rem] px-4 py-2.5 text-sm font-medium disabled:opacity-40 ${styles} ${className}`}
    />
  );
}

/**
 * A bottom sheet. Phone-first: everything that needs more than a tap opens
 * from the bottom edge rather than navigating away from the page.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  useBackDismiss(open, onClose);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="rise relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[1.75rem] border border-line bg-raised px-5 pt-3"
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
      >
        <div className="sticky top-0 -mx-5 mb-3 bg-raised px-5 pb-2 pt-1">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" />
          {title && <h3 className="text-center text-sm font-semibold">{title}</h3>}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Small transient confirmation. Deliberately quiet — no success modals. */
export function useFlash(): [string | null, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2200);
    return () => clearTimeout(t);
  }, [msg]);
  return [msg, setMsg];
}

export function Flash({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div
      className="rise pointer-events-none fixed inset-x-0 z-50 flex justify-center"
      style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
    >
      <div className="rounded-full border border-line bg-raised px-4 py-2 text-sm shadow-lg">
        {children}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="card px-5 py-8 text-center text-sm text-ink-faint">{children}</div>
  );
}

/**
 * Shows the database's own words rather than a generic apology.
 *
 * A recursive RLS policy once presented itself as "could not save that", which
 * made a schema bug look like a typing bug. Always surface the real message.
 */
export function Problem({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-2xl border border-rose/40 bg-rose-soft px-4 py-3 text-left">
      <p className="text-[0.8125rem] font-medium">Something went wrong</p>
      <p className="mt-1 font-mono text-[0.75rem] leading-relaxed text-ink-soft">
        {message}
      </p>
    </div>
  );
}
