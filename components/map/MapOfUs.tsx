"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabaseBrowser } from "@/lib/supabase/client";
import { notifyPartner } from "@/lib/push";
import { localDay, prettyDay } from "@/lib/day";
import type { Profile, TimelineEntry } from "@/lib/types";
import { Button, Flash, Problem, Sheet, useFlash } from "@/components/ui";

type Pending = { lat: number; lng: number };

/**
 * Map of us — every `place` entry, pinned.
 *
 * Uses a divIcon rather than Leaflet's default marker so pins can be tinted by
 * whoever added them, and so we avoid the well-known broken-image problem where
 * Leaflet's bundled icon URLs don't survive bundling.
 */
export default function MapOfUs({
  me,
  partner,
  places,
}: {
  me: Profile;
  partner: Profile | null;
  places: TimelineEntry[];
}) {
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  const [pending, setPending] = useState<Pending | null>(null);
  const [selected, setSelected] = useState<TimelineEntry | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [day, setDay] = useState(localDay());
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [flash, setFlash] = useFlash();

  const pinned = useMemo(
    () => places.filter((p) => p.lat !== null && p.lng !== null),
    [places]
  );

  // --- create the map once -------------------------------------------------
  useEffect(() => {
    if (!container.current || map.current) return;

    const instance = L.map(container.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([20, 0], 2);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(instance);

    L.control.zoom({ position: "bottomright" }).addTo(instance);

    instance.on("click", (e: L.LeafletMouseEvent) => {
      setPending({ lat: e.latlng.lat, lng: e.latlng.lng });
      setName("");
      setBody("");
      setDay(localDay());
    });

    layer.current = L.layerGroup().addTo(instance);
    map.current = instance;

    return () => {
      instance.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  // --- redraw pins whenever the data changes -------------------------------
  useEffect(() => {
    const group = layer.current;
    const instance = map.current;
    if (!group || !instance) return;

    group.clearLayers();

    for (const place of pinned) {
      const mine = place.author_id === me.id;
      const colour = mine ? `var(--${me.accent})` : `var(--${partner?.accent ?? "rose"})`;

      const icon = L.divIcon({
        className: "",
        html: `<span style="
          display:block;width:18px;height:18px;border-radius:999px;
          background:${colour};border:2.5px solid var(--bg-raised);
          box-shadow:0 2px 6px rgb(0 0 0 / .45);"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      L.marker([place.lat!, place.lng!], { icon })
        .addTo(group)
        .on("click", () => setSelected(place));
    }

    // Frame everything the first time there is something to frame.
    if (pinned.length > 0 && instance.getZoom() <= 2) {
      const bounds = L.latLngBounds(pinned.map((p) => [p.lat!, p.lng!] as [number, number]));
      instance.fitBounds(bounds, { padding: [48, 48], maxZoom: 13 });
    }
  }, [pinned, me.id, me.accent, partner?.accent]);

  function locate() {
    if (!navigator.geolocation || !map.current) return;
    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        map.current?.setView([coords.latitude, coords.longitude], 14);
        setPending({ lat: coords.latitude, lng: coords.longitude });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setFlash("Could not get your location");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function savePin() {
    if (!pending || !name.trim() || saving) return;
    setSaving(true);
    setProblem(null);

    const { error } = await supabaseBrowser().from("timeline_entries").insert({
      author_id: me.id,
      kind: "place",
      title: name.trim(),
      body: body.trim() || null,
      place_name: name.trim(),
      lat: pending.lat,
      lng: pending.lng,
      occurred_on: day,
    });

    setSaving(false);
    if (error) {
      setProblem(error.message);
      return;
    }

    notifyPartner({
      title: me.display_name,
      body: `pinned ${name.trim()} on your map`,
      url: "/map",
      tag: "map",
    });

    setPending(null);
    setFlash("Pinned");
    router.refresh();
  }

  async function removePin(entry: TimelineEntry) {
    const { error } = await supabaseBrowser()
      .from("timeline_entries")
      .delete()
      .eq("id", entry.id);

    if (error) {
      setProblem(error.message);
      return;
    }
    setSelected(null);
    router.refresh();
  }

  return (
    <>
      <div className="relative overflow-hidden rounded-[1.25rem] border border-line">
        <div ref={container} className="h-[62dvh] w-full bg-sunken" />

        <button
          onClick={locate}
          disabled={locating}
          aria-label="Go to my location"
          className="press absolute left-3 top-3 z-[400] rounded-full border border-line bg-raised px-3 py-2 text-xs shadow-lg"
        >
          {locating ? "…" : "◎ Me"}
        </button>
      </div>

      <p className="mt-2 px-1 text-center text-[0.75rem] text-ink-faint">
        Tap anywhere on the map to drop a pin.
      </p>

      {problem && (
        <div className="mt-3">
          <Problem message={problem} />
        </div>
      )}

      <div className="mt-4 flex items-center justify-center gap-4 text-[0.75rem] text-ink-faint">
        <Legend colour={`var(--${me.accent})`} label="You" />
        <Legend colour={`var(--${partner?.accent ?? "rose"})`} label={partner?.display_name ?? "Them"} />
        <span>· {pinned.length} pinned</span>
      </div>

      {/* --- drop a pin --- */}
      <Sheet open={!!pending} onClose={() => setPending(null)} title="Pin this place">
        <div className={`accent-${me.accent} flex flex-col gap-4 pb-2`}>
          {pending && (
            <p className="text-[0.75rem] tabular-nums text-ink-faint">
              {pending.lat.toFixed(5)}, {pending.lng.toFixed(5)}
            </p>
          )}

          <div>
            <p className="label mb-1.5">What is this place?</p>
            <input
              type="text"
              autoFocus
              placeholder="The bench by the river"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <p className="label mb-1.5">What happened here?</p>
            <textarea
              rows={3}
              placeholder="Optional, but this is the part you'll want in ten years."
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          <div>
            <p className="label mb-1.5">When?</p>
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </div>

          <Button onClick={savePin} disabled={!name.trim() || saving} className="w-full py-3">
            {saving ? "…" : "Drop the pin"}
          </Button>
        </div>
      </Sheet>

      {/* --- inspect a pin --- */}
      <Sheet
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.place_name ?? "Place"}
      >
        {selected && (
          <div className="pb-2">
            <p className="label mb-2">
              {selected.author_id === me.id ? "You" : (partner?.display_name ?? "Them")} ·{" "}
              {prettyDay(selected.occurred_on)}
            </p>
            {selected.body && (
              <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed">
                {selected.body}
              </p>
            )}
            <div className="mt-5 flex items-center justify-between gap-3">
              <a
                href={`https://www.openstreetmap.org/?mlat=${selected.lat}&mlon=${selected.lng}#map=16/${selected.lat}/${selected.lng}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline"
              >
                Open in maps
              </a>
              {selected.author_id === me.id && (
                <button
                  onClick={() => removePin(selected)}
                  className="text-sm text-rose underline"
                >
                  Remove pin
                </button>
              )}
            </div>
          </div>
        )}
      </Sheet>

      <Flash>{flash}</Flash>
    </>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: colour }} />
      {label}
    </span>
  );
}
