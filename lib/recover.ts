"use client";

/**
 * Recovery from a stale build.
 *
 * When a new version is deployed, an already-open tab still holds the old
 * document, which references JavaScript chunks that no longer exist on the
 * server. The next navigation asks for one, gets a 404, and React unmounts the
 * whole tree — which is what a blank "Application error" screen actually is.
 *
 * An installed PWA makes this far more likely, because it can be resumed days
 * after it was last opened, long after several deploys have been and gone.
 * That matches "fresh open fails, pull-to-refresh fixes it": the refresh is
 * fetching a current document.
 */
const GUARD_KEY = "otherme:recovering";

export function isStaleBuildError(error: unknown): boolean {
  if (!error) return false;

  const name = (error as { name?: string }).name ?? "";
  const message = (error as { message?: string }).message ?? "";

  return (
    name === "ChunkLoadError" ||
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  );
}

/**
 * Clears caches and reloads — once. The guard matters: if the reload fails the
 * same way, looping would leave a permanently flashing screen instead of a
 * readable error.
 */
export function recoverFromStaleBuild(): void {
  if (typeof window === "undefined") return;

  if (sessionStorage.getItem(GUARD_KEY)) {
    sessionStorage.removeItem(GUARD_KEY);
    return;
  }

  sessionStorage.setItem(GUARD_KEY, "1");

  const done = () => window.location.reload();

  if ("caches" in window) {
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .finally(done);
  } else {
    done();
  }
}

/** Clears the guard once a load has visibly succeeded. */
export function markRecovered(): void {
  if (typeof window !== "undefined") sessionStorage.removeItem(GUARD_KEY);
}

/**
 * Catches the stale-chunk case when it surfaces outside React's error boundary
 * — an unhandled rejection from a dynamic import, typically.
 */
export function installStaleBuildRecovery(): () => void {
  const onError = (event: ErrorEvent) => {
    if (isStaleBuildError(event.error) || isStaleBuildError({ message: event.message })) {
      recoverFromStaleBuild();
    }
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    if (isStaleBuildError(event.reason)) recoverFromStaleBuild();
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
