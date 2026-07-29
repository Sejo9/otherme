import { requireSession } from "@/lib/session";
import ListenRoom from "@/components/listen/ListenRoom";

export const dynamic = "force-dynamic";

export default async function ListenPage() {
  const { me, partner } = await requireSession();
  return <ListenRoom me={me} partner={partner} />;
}
