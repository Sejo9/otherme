"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { disablePush, enablePush, isStandalone, pushEnabled, pushSupported } from "@/lib/push";
import type { Accent, Profile, Settings, Tier } from "@/lib/types";
import { Button, Flash, Section, useFlash } from "@/components/ui";

const TIERS: { id: Tier; label: string; hint: string }[] = [
  { id: "light", label: "Light", hint: "Answerable on a bus" },
  { id: "reflective", label: "Reflective", hint: "Needs a minute" },
  { id: "deep", label: "Deep", hint: "Needs honesty" },
  { id: "spicy", label: "Just for us", hint: "Off by default" },
];

export default function SettingsForm({
  me,
  partner,
  settings,
}: {
  me: Profile;
  partner: Profile | null;
  settings: Settings;
}) {
  const router = useRouter();
  const [flash, setFlash] = useFlash();

  const [name, setName] = useState(me.display_name);
  const [accent, setAccent] = useState<Accent>(me.accent);
  const [anniversary, setAnniversary] = useState(settings.anniversary ?? "");
  const [apart, setApart] = useState(settings.apart);
  const [reunionAt, setReunionAt] = useState(
    settings.reunion_at ? toLocalInput(settings.reunion_at) : ""
  );
  const [reunionLabel, setReunionLabel] = useState(settings.reunion_label ?? "");
  const [tiers, setTiers] = useState<Tier[]>(settings.enabled_tiers);
  const [saving, setSaving] = useState(false);

  const [push, setPush] = useState<"unknown" | "on" | "off" | "unsupported">("unknown");
  const [standalone, setStandalone] = useState(true);

  useEffect(() => {
    setStandalone(isStandalone());
    if (!pushSupported()) {
      setPush("unsupported");
      return;
    }
    pushEnabled().then((on) => setPush(on ? "on" : "off"));
  }, []);

  async function save() {
    setSaving(true);
    const sb = supabaseBrowser();

    const [profileResult, settingsResult] = await Promise.all([
      sb.from("profiles").update({ display_name: name.trim(), accent }).eq("id", me.id),
      sb
        .from("settings")
        .update({
          anniversary: anniversary || null,
          apart,
          reunion_at: apart && reunionAt ? new Date(reunionAt).toISOString() : null,
          reunion_label: apart ? reunionLabel.trim() || null : null,
          enabled_tiers: tiers.length ? tiers : ["light"],
          updated_at: new Date().toISOString(),
        })
        .eq("id", true),
    ]);

    setSaving(false);
    if (profileResult.error || settingsResult.error) {
      setFlash("Could not save");
      return;
    }
    setFlash("Saved");
    router.refresh();
  }

  async function togglePush() {
    try {
      if (push === "on") {
        await disablePush();
        setPush("off");
        setFlash("Notifications off");
      } else {
        await enablePush(me.id);
        setPush("on");
        setFlash("Notifications on");
      }
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Could not change that");
    }
  }

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <Section title="You">
        <div className="card flex flex-col gap-4 px-4 py-4">
          <div>
            <p className="label mb-1.5">Name</p>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <p className="label mb-1.5">Your colour</p>
            <div className="flex gap-2">
              {(["amber", "rose"] as Accent[]).map((a) => (
                <button
                  key={a}
                  onClick={() => setAccent(a)}
                  className={`press accent-${a} flex flex-1 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm capitalize`}
                  style={
                    accent === a
                      ? { borderColor: "var(--accent)", background: "var(--accent-soft)" }
                      : { borderColor: "var(--line)" }
                  }
                >
                  <span
                    className="h-3.5 w-3.5 rounded-full"
                    style={{ background: "var(--accent)" }}
                  />
                  {a}
                </button>
              ))}
            </div>
            {partner && partner.accent === accent && (
              <p className="mt-1.5 text-[0.75rem] text-rose">
                {partner.display_name} is using this one too — pick the other so you can tell
                yourselves apart.
              </p>
            )}
          </div>
        </div>
      </Section>

      <Section title="Notifications">
        <div className="card px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Push notifications</p>
              <p className="mt-0.5 text-[0.75rem] leading-snug text-ink-faint">
                Pulses, answers, photos. This is most of the app.
              </p>
            </div>
            <Button
              variant={push === "on" ? "quiet" : "solid"}
              onClick={togglePush}
              disabled={push === "unsupported" || push === "unknown"}
            >
              {push === "on" ? "On" : push === "unsupported" ? "N/A" : "Turn on"}
            </Button>
          </div>

          {!standalone && (
            <p className="mt-3 rounded-xl border border-line bg-sunken px-3 py-2.5 text-[0.75rem] leading-relaxed text-ink-soft">
              On iPhone, add this to your home screen first — Share → Add to Home Screen —
              then turn notifications on from the installed app. Safari in a tab cannot
              receive push.
            </p>
          )}
        </div>
      </Section>

      <Section title="The two of you">
        <div className="card flex flex-col gap-4 px-4 py-4">
          <div>
            <p className="label mb-1.5">Anniversary</p>
            <input
              type="date"
              value={anniversary}
              onChange={(e) => setAnniversary(e.target.value)}
            />
            <p className="mt-1 text-[0.75rem] text-ink-faint">
              Drives the day count and the next milestone.
            </p>
          </div>

          <label className="flex items-center justify-between rounded-2xl border border-line bg-sunken px-4 py-3">
            <div className="pr-3">
              <p className="text-sm font-medium">We&apos;re apart right now</p>
              <p className="text-[0.75rem] leading-snug text-ink-faint">
                Swaps the home screen for a countdown to being back together.
              </p>
            </div>
            <input
              type="checkbox"
              checked={apart}
              onChange={(e) => setApart(e.target.checked)}
              className="h-6 w-6 shrink-0"
            />
          </label>

          {apart && (
            <div className="flex flex-col gap-3 rounded-2xl border border-line px-4 py-3.5">
              <div>
                <p className="label mb-1.5">Back together at</p>
                <input
                  type="datetime-local"
                  value={reunionAt}
                  onChange={(e) => setReunionAt(e.target.value)}
                />
              </div>
              <div>
                <p className="label mb-1.5">Call it something</p>
                <input
                  type="text"
                  placeholder="Airport pickup"
                  value={reunionLabel}
                  onChange={(e) => setReunionLabel(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section title="Daily question">
        <div className="card flex flex-col gap-2 px-4 py-4">
          <p className="mb-1 text-[0.75rem] leading-snug text-ink-faint">
            Which kinds of question can come up. Both of you share this setting.
          </p>
          {TIERS.map((t) => {
            const on = tiers.includes(t.id);
            return (
              <label
                key={t.id}
                className="flex items-center justify-between rounded-xl border border-line px-3.5 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-[0.75rem] text-ink-faint">{t.hint}</p>
                </div>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) =>
                    setTiers((prev) =>
                      e.target.checked ? [...prev, t.id] : prev.filter((x) => x !== t.id)
                    )
                  }
                  className="h-5 w-5"
                />
              </label>
            );
          })}
        </div>
      </Section>

      <Button onClick={save} disabled={saving} className="mb-4 w-full py-3">
        {saving ? "…" : "Save"}
      </Button>

      <button
        onClick={signOut}
        className="mb-4 w-full py-3 text-center text-sm text-ink-faint underline"
      >
        Sign out
      </button>

      <Flash>{flash}</Flash>
    </>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
