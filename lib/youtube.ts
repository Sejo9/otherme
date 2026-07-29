"use client";

/**
 * Just enough of the YouTube IFrame API to drive playback, typed by hand
 * rather than pulling in @types/youtube for six methods.
 */
export type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  loadVideoById(id: string): void;
  cueVideoById(id: string): void;
  setVolume(v: number): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  destroy(): void;
};

/**
 * The player's methods are attached asynchronously, so during the window
 * between construction and `onReady` any of them may simply not exist yet.
 * Calling one then throws, and a throw inside the sync interval is exactly the
 * kind of thing that surfaces as a blank screen.
 */
export function callPlayer<K extends keyof YTPlayer>(
  player: YTPlayer | null,
  method: K,
  ...args: Parameters<Extract<YTPlayer[K], (...a: never[]) => unknown>>
): ReturnType<Extract<YTPlayer[K], (...a: never[]) => unknown>> | undefined {
  const fn = player?.[method];
  if (typeof fn !== "function") return undefined;
  try {
    return (fn as (...a: unknown[]) => never).apply(player, args);
  } catch {
    return undefined;
  }
}

export const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

type YTNamespace = {
  Player: new (
    element: HTMLElement | string,
    options: {
      videoId?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { data: number; target: YTPlayer }) => void;
        onError?: (e: { data: number }) => void;
      };
    }
  ) => YTPlayer;
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

/** Loads the IFrame API once per document and resolves when it is usable. */
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }

    // The API calls a single global when it is ready, so chain onto whatever
    // may already be there rather than clobbering it.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube API loaded without a player"));
    };

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("Could not load the YouTube player"));
    document.head.appendChild(script);
  });

  return apiPromise;
}

/**
 * Pulls a video id out of anything someone might paste: a watch URL, a share
 * link, an embed, a Shorts link, a music.youtube link, or a bare id.
 */
export function parseYouTubeId(input: string): string | null {
  const text = input.trim();
  if (!text) return null;

  if (/^[\w-]{11}$/.test(text)) return text;

  let url: URL;
  try {
    url = new URL(text.startsWith("http") ? text : `https://${text}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return /^[\w-]{11}$/.test(id) ? id : null;
  }

  if (host === "youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com") {
    const v = url.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) return v;

    const match = url.pathname.match(/\/(embed|shorts|v|live)\/([\w-]{11})/);
    if (match) return match[2];
  }

  return null;
}

/** Best-effort title, via the public oEmbed endpoint. No API key needed. */
export async function fetchYouTubeTitle(videoId: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { title?: string };
    return data.title ?? null;
  } catch {
    return null;
  }
}
