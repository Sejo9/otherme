"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { notifyPartner } from "@/lib/push";
import {
  ACTIVITIES,
  WEATHER,
  type Presence,
  type Profile,
  type Weather,
} from "@/lib/types";
import { Button, Sheet } from "@/components/ui";

const WEATHERS = Object.keys(WEATHER) as Weather[];

export default function MoodSheet({
  open,
  onClose,
  me,
  current,
}: {
  open: boolean;
  onClose: () => void;
  me: Profile;
  current: Presence | null;
}) {
  const router = useRouter();
  const [weather, setWeather] = useState<Weather>(current?.weather ?? "partly");
  const [battery, setBattery] = useState(current?.battery ?? 70);
  const [activity, setActivity] = useState(current?.activity ?? "unset");
  const [note, setNote] = useState(current?.note ?? "");
  const [available, setAvailable] = useState(current?.available_to_call ?? false);
  const [saving, setSaving] = useState(false);

  // Re-seed the form whenever the sheet is opened, so it always reflects what
  // is actually stored rather than a stale first render.
  useEffect(() => {
    if (!open) return;
    setWeather(current?.weather ?? "partly");
    setBattery(current?.battery ?? 70);
    setActivity(current?.activity ?? "unset");
    setNote(current?.note ?? "");
    setAvailable(current?.available_to_call ?? false);
  }, [open, current]);

  async function save() {
    setSaving(true);

    const { error } = await supabaseBrowser().from("presence").upsert(
      {
        user_id: me.id,
        weather,
        battery,
        activity,
        note: note.trim() || null,
        available_to_call: available,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    setSaving(false);
    if (error) return;

    // Only interrupt them for the things worth interrupting for — a hard day,
    // running on empty, or newly becoming free to talk.
    const nowAvailable = available && !current?.available_to_call;
    const worthATap = weather === "storm" || battery <= 20 || nowAvailable;

    if (worthATap) {
      notifyPartner({
        title: me.display_name,
        body: nowAvailable
          ? "is free to talk right now"
          : weather === "storm"
            ? "is having a hard day"
            : "is running low",
        url: "/",
        tag: "presence",
      });
    }

    router.refresh();
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="How is your day?">
      <div className={`accent-${me.accent} flex flex-col gap-6 pb-2`}>
        <div>
          <p className="label mb-2">Weather</p>
          <div className="grid grid-cols-3 gap-2">
            {WEATHERS.map((w) => (
              <button
                key={w}
                onClick={() => setWeather(w)}
                className={`press flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 transition-colors ${
                  weather === w
                    ? "border-transparent"
                    : "border-line bg-sunken"
                }`}
                style={weather === w ? { background: "var(--accent-soft)", borderColor: "var(--accent)" } : undefined}
              >
                <span className="text-xl leading-none">{WEATHER[w].icon}</span>
                <span className="text-[0.6875rem] font-medium">{WEATHER[w].label}</span>
                <span className="text-[0.625rem] leading-tight text-ink-faint">
                  {WEATHER[w].hint}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <p className="label">Social battery</p>
            <p className="text-sm tabular-nums text-ink-soft">{battery}%</p>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={battery}
            onChange={(e) => setBattery(Number(e.target.value))}
          />
          <p className="text-[0.6875rem] text-ink-faint">
            {battery <= 20
              ? "Running on empty — needs looking after"
              : battery <= 50
                ? "Depleted but functioning"
                : battery <= 80
                  ? "Comfortable"
                  : "Full of it"}
          </p>
        </div>

        <div>
          <p className="label mb-2">Right now</p>
          <div className="flex flex-wrap gap-2">
            {ACTIVITIES.map((a) => (
              <button
                key={a.id}
                onClick={() => setActivity(a.id)}
                className={`pill press ${activity === a.id ? "pill-active" : ""}`}
              >
                <span>{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="label mb-2">Anything you want them to know</p>
          <textarea
            rows={2}
            maxLength={140}
            placeholder="Optional. One line."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <label className="flex items-center justify-between rounded-2xl border border-line bg-sunken px-4 py-3">
          <div>
            <p className="text-sm font-medium">Free to talk</p>
            <p className="text-[0.6875rem] text-ink-faint">
              Answers “is this a good time to call?” without asking
            </p>
          </div>
          <input
            type="checkbox"
            checked={available}
            onChange={(e) => setAvailable(e.target.checked)}
            className="h-6 w-6 accent-current"
          />
        </label>

        <Button onClick={save} disabled={saving} className="w-full py-3">
          {saving ? "…" : "Save"}
        </Button>
      </div>
    </Sheet>
  );
}
