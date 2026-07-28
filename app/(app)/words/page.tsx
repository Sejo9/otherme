import { requireSession } from "@/lib/session";
import WordDuel from "@/components/games/WordDuel";

export const dynamic = "force-dynamic";

export default async function WordsPage() {
  const { me, partner } = await requireSession();
  return <WordDuel me={me} partner={partner} />;
}
