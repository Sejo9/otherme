import { requireSession } from "@/lib/session";
import KnowMe from "@/components/knowme/KnowMe";

export const dynamic = "force-dynamic";

export default async function KnowMePage() {
  const { me, partner } = await requireSession();
  return <KnowMe me={me} partner={partner} />;
}
