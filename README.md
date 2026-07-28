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

**Us** — the timeline. Photos, notes, appreciations, milestones, songs (with the
reason attached), inside jokes, places. Filterable, grouped by month.

**Rituals**

- **Nightly three** — a high, a low, and one thing about them. The third one is
  written to the timeline, so the appreciation ledger builds itself.
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

Then in **Authentication → Providers → Email**, turn **"Allow new users to sign
up" off**. This app is capped at two accounts and there is no reason to leave
the door open. (The database enforces the cap independently — the `claim_self`
policy on `profiles` refuses a third.)

Create your two accounts by hand in **Authentication → Users → Add user**, with
"Auto Confirm User" ticked.

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
- **web-push** with VAPID, no third-party notification service

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

**Notifications are deliberately sparse.** Presence changes only interrupt for a
storm day, a battery under 20, or newly becoming free to talk. `/api/push/send`
takes no recipient — the server derives the partner from the session, so it
can't be pointed anywhere else.

---

## Things left on the table

Ideas that fit the architecture but aren't built yet, roughly in order of
value-per-effort:

- **Voice notes** with delayed delivery (record now, arrives at their morning
  alarm). `MediaRecorder` plus the existing storage bucket.
- **Map of us** — `place` entries already carry `lat`/`lng`; they just need a
  map view.
- **Annual wrapped** — a year-end recap generated from the timeline and the
  know-me scores.
- **Sync watch** — shared playback position over a realtime channel.
- **Weekly check-in** — a time-boxed structured agenda, harder to design well
  than it looks.
- **Async games** — chess or a word game, on the same reveal mechanics.
