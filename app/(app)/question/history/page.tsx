import Link from "next/link";
import { requireSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { prettyDay } from "@/lib/day";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  day: string;
  prompts: { body: string } | null;
  question_answers: { user_id: string; body: string }[];
};

export default async function QuestionHistoryPage() {
  const { me, partner } = await requireSession();
  const supabase = await supabaseServer();

  // RLS still applies to the nested select: days you never answered come back
  // with an empty answer list, so nothing leaks through the archive.
  const { data } = await supabase
    .from("daily_questions")
    .select("id, day, prompts(body), question_answers(user_id, body)")
    .order("day", { ascending: false })
    .limit(120);

  const rows = ((data ?? []) as unknown as Row[]).filter(
    (r) => r.question_answers.length >= 2
  );

  return (
    <>
      <header className="mb-6 pt-2">
        <Link href="/question" className="text-sm text-ink-faint">
          ← Today
        </Link>
        <h1 className="mt-2 font-serif text-2xl">Answered together</h1>
        <p className="mt-1 text-[0.8125rem] text-ink-soft">
          {rows.length} question{rows.length === 1 ? "" : "s"} you&apos;ve both opened.
        </p>
      </header>

      {rows.length === 0 ? (
        <Empty>
          Nothing here yet. A question appears once you have both answered it.
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => {
            const mine = row.question_answers.find((a) => a.user_id === me.id);
            const theirs = row.question_answers.find((a) => a.user_id !== me.id);

            return (
              <article key={row.id} className="card px-4 py-4">
                <p className="label">{prettyDay(row.day)}</p>
                <h2 className="mt-1.5 font-serif text-[1.0625rem] leading-snug">
                  {row.prompts?.body}
                </h2>

                <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
                  {mine && (
                    <div className={`accent-${me.accent}`}>
                      <p className="label mb-1" style={{ color: "var(--accent)" }}>
                        You
                      </p>
                      <p className="whitespace-pre-wrap text-[0.875rem] leading-relaxed">
                        {mine.body}
                      </p>
                    </div>
                  )}
                  {theirs && (
                    <div className={`accent-${partner?.accent ?? "rose"}`}>
                      <p className="label mb-1" style={{ color: "var(--accent)" }}>
                        {partner?.display_name ?? "Them"}
                      </p>
                      <p className="whitespace-pre-wrap text-[0.875rem] leading-relaxed">
                        {theirs.body}
                      </p>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
