# OtherMe

A private application for exactly two people.

Not a social network with the audience removed — the mechanics are built for a
pair. Answers unlock only when you have both answered. The game scores how well
you predict each other. Nothing is public, nothing is liked, nothing counts a
streak against you.

---

## What's in it

**Today** — the screen you'll actually open.

- **Mood weather** and **social battery** for each of you, so "today is hard" or
  "I have nothing left" can be said in one tap instead of a paragraph.
- **The pulse** — a wordless tap that buzzes their phone. One tap sends
  "thinking of you"; long-press for the others.
- **Photo of the day** — one each, no caption required, no reactions.
- **Free to talk** — permanently answers "is this a good time to call?".
- **Goodnight** — you both press it, and it waits for whoever is later.
- **On this day** — anything from the timeline that happened on this date in an
  earlier year.

**Question** — one prompt a day, answered blind by both of you, revealed
simultaneously. 78 prompts across four tiers (light → reflective → deep → just
for us; the last is off by default).

**Know me** — the same question asked twice: what you'd actually pick, and what
you think *they* picked. You score when you read them right. 24 questions,
with a running percentage each.

**Play** — four turn-based games you pick up whenever: **four in a row**,
**checkers**, **reversi** and **chess**. No clock, a running series record, and
moves that appear on the other screen live. Turn order is enforced by the
database, not the client.

Chess has legal-move highlighting, castling, en passant, promotion, check and
checkmate detection, a captured-piece tray and a move list. Checkers enforces
compulsory captures and multi-jumps. Both boards flip so your own pieces are
always nearest you.

**21 Questions** — a round of 21 couples questions, drawn from a pool of 140
written for people who already have a history together. Same mutual reveal as
everywhere else.

Skipping is **negotiated, not unilateral**. Asking to skip does not skip the
question; it proposes it. Your partner is told, and can agree — in which case
the question is closed with nothing revealed — or decline, in which case they
answer and you are asked to answer after all. Their answer stays sealed until
you do, so a skip can never become a way of reading their answer without
giving yours.

**Word duel** — one hidden five-letter word a day. You both attack it
independently, and their board unlocks when you have both finished. Not
turn-based, so it lives in its own tables rather than being forced into the
turn-enforced `games` model.

**Us** — the timeline. Photos, notes, appreciations, milestones, songs (with the
reason attached), inside jokes, places, voice notes. Filterable, grouped by
month, and everything with media attached is downloadable.

**Map of us** — every place you've pinned, coloured by who pinned it. Tap
anywhere to drop a pin, or use your current location.

**Rituals**

- **Nightly three** — a high, a low, and one thing about them. The third one is
  written to the timeline, so the appreciation ledger builds itself.
- **Voice notes** — record up to five minutes and send it now, or schedule it
  for their morning, this evening, or a week out. A scheduled note is
  unreadable until it lands; they see only that something is coming.
- **The jar** — drop a question in for the other, answerable whenever. No
  deadline, no reminder, no expiry.
- **Time capsules** — letters sealed until a date you choose. They know
  something is waiting, and when it opens, and nothing else.

**Apart mode** — flip it in settings and the home screen becomes a live
countdown to being back together.

---

## Setup

### 1. Supabase

Create a project at [supabase.com](https://supabase.com) (the free tier is far
more than two people will ever need).

In **SQL Editor**, run in order:

1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_seed_prompts.sql`
3. `supabase/migrations/0003_fixes_and_features.sql`
4. `supabase/migrations/0004_more_games.sql`
5. `supabase/migrations/0005_fix_word_round.sql`
6. `supabase/migrations/0006_today_snapshot.sql`
7. `supabase/migrations/0007_twenty_one.sql`
8. `supabase/migrations/0008_seed_twenty_one.sql`

If the SQL editor returns `Failed to fetch`, that is a browser/network error
rather than a SQL one — the statement may well have run. Prefer the CLI:

```bash
npx supabase link --project-ref YOUR_REF
npx supabase db push
```

Then in **Authentication → Providers → Email**, turn **"Allow new users to sign
up" off**. This app is capped at two accounts and there is no reason to leave
the door open. (The database enforces the cap independently — the `claim_self`
policy on `profiles` refuses a third.)

Create your two accounts by hand in **Authentication → Users → Add user**, with
"Auto Confirm User" ticked.

Finally — and this one is worth doing, because it is the difference between a
snappy app and a sluggish one — go to **Authentication → JWT Keys** and migrate
to **asymmetric signing keys**. The app verifies your session by checking the
JWT signature locally against a cached key set. With a legacy shared secret
that is impossible, so every single request has to ask the auth server who you
are, adding a network round trip to every navigation and every prefetch.

### 2. Environment

```bash
cp .env.local.example .env.local
```

Fill in the Supabase URL, anon key, and service role key from
**Project Settings → API**.

Then generate the push keys:

```bash
npm run gen:vapid
```

Paste the three lines it prints into `.env.local`. Generate these **once** —
regenerating invalidates every existing push subscription.

### 3. Run it

```bash
npm install
npm run dev
```

Sign in as the first account. You'll be asked for a name and a colour. Sign in
as the second on the other phone and do the same — the second colour is locked
so you can always tell yourselves apart.

### 4. Deploy

Push to a Git repo, import it at [vercel.com](https://vercel.com), and add the
same environment variables. Free tier, permanently.

### 5. Install it on both phones

This matters more than anything else in this file. The app is mostly a thing
that taps you on the shoulder, and that only works from the home screen.

- **iPhone**: open the deployed URL in Safari → Share → **Add to Home Screen**.
  Then open it *from the home screen icon* and turn on notifications in
  Settings. iOS will not deliver web push to a Safari tab — it has to be the
  installed app.
- **Android**: Chrome will offer "Install app". Notifications work either way.

---

## How it's built

- **Next.js 15** (App Router) as an installable PWA
- **Supabase** — Postgres, Auth, Realtime, Storage
- **Tailwind v4**, no component library
- **Leaflet** + OpenStreetMap tiles for the map
- **web-push** with VAPID, no third-party notification service
- **chess.js** for chess legality; everything else (`lib/games.ts`,
  `lib/checkers.ts`, `lib/words.ts`) is plain functions with no dependency

### The parts worth knowing about

**Mutual reveal is enforced in the database, not the UI.** The RLS policy on
`question_answers` returns your partner's row only if a row of your own already
exists for that question. Same for `know_me_responses`. There is no client-side
path around it, and no "just don't render it" trick — the data does not arrive.

**Capsules are sealed by the same mechanism.** `sealed_until_unlock` withholds
the row until `now() >= unlock_at`. The `waiting_capsules()` function exists so
the recipient can see *that* something is waiting without seeing the title or
the body.

**Everything that accrues is one table.** Photos, notes, appreciations,
milestones, songs, jokes and places are all rows in `timeline_entries`. The
timeline, the memory jar, the appreciation ledger, "on this day" and the filter
chips are all views over it. Adding a new kind of keepsake is one enum value.

**"Today" is the viewer's local date.** If you're in different timezones for a
stretch, whoever wakes first opens the day and the other joins when their own
date rolls over. `ensure_daily_question` uses `on conflict do nothing`, so
whoever gets there first decides the prompt and the other converges on it.

**Turn order is an RLS policy, not client logic.** `only_on_your_turn` lets you
write to a game row only while `turn = auth.uid()`. A stale tab, a double tap,
or a hand-crafted request cannot move twice or move out of turn. A finished
game sets `turn` to null, which makes the row immutable.

**Notifications are deliberately sparse.** Presence changes only interrupt for a
storm day, a battery under 20, or newly becoming free to talk. `/api/push/send`
takes no recipient — the server derives the partner from the session, so it
can't be pointed anywhere else.

**Never show a generic error.** A recursive RLS policy once surfaced as "could
not save that", which made a schema bug look like a typing bug and cost an
evening. `<Problem>` prints the database's own message.

**The word duel's answer is not secret from the browser, on purpose.** Both
clients derive it from the date (`wordForDay`) and score guesses locally, which
keeps play instant and works with a flaky signal. Hiding it properly would mean
the server picking a random word and scoring every guess over the network — a
round trip per guess to defend against one of you opening devtools to cheat at
a word game with the other. Not a trade worth making here.

**Navigation is tuned for a tab bar, not a website.** Three things make it feel
native rather than webby:

- Identity is established with `getClaims()` (local JWT verification), not
  `getUser()` (a network round trip), and `requireSession()` is wrapped in
  React `cache()` so a layout and its page share one result.
- `experimental.staleTimes` keeps dynamic pages in the client router cache.
  Next's default for dynamic routes is zero seconds, which means every tab
  switch refetches from the server. Realtime keeps contents fresh anyway.
- Tabs and sub-navs `replace` rather than push, so back leaves the app instead
  of retracing every tab you ever tapped, and `useBackDismiss` makes the back
  gesture close sheets and photos first.

Anything reached *inside* a tab still pushes, so back behaves normally there.

**Today renders complete, with nothing fetched afterwards.** It used to
assemble itself from five browser requests in two waterfalls, which is why it
flashed skeletons even once navigation was fast. `today_snapshot` returns the
question status, the know-me status, the goodnights, today's photos and the
on-this-day entries in one call, made during the server render alongside
presence and pulses — three parallel requests, one round trip.

That requires the server to know what "today" means to you, which it takes from
`profiles.timezone`. `AppShell` corrects that column whenever your device
disagrees with it, so it follows you if you travel. If the stored zone is
nonetheless stale when a page renders — you flew and this is the first load, or
midnight passed while the tab sat open — the client notices the mismatch and
refetches. That path is the exception, not the default.

**Beware `returns table` in PL/pgSQL.** Output columns are in scope as
variables, so a `returns table (… day date …)` function cannot refer to a
column also called `day` without qualification — you get `column reference
"day" is ambiguous`. `language sql` functions do no substitution and are
unaffected.

---

## Things left on the table

Ideas that fit the architecture but aren't built yet, roughly in order of
value-per-effort:

- **Annual wrapped** — a year-end recap generated from the timeline, the
  appreciation ledger and the know-me scores.
- **Sync watch** — shared playback position over a realtime channel. Works
  cleanly for anything you can host yourself or embed via the YouTube iframe
  API; DRM services (Netflix, Disney+) cannot be driven programmatically.
- **Weekly check-in** — a time-boxed structured agenda, harder to design well
  than it looks.
- **Sync listen** — more tractable than sync watch, because Spotify publishes a
  playback-control API and Netflix publishes nothing. See the notes below.
- **Delivery scheduling for push** — a scheduled voice note currently arrives
  silently; a Supabase cron job could fire the notification at `deliver_at`.
