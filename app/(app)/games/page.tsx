import { requireSession } from "@/lib/session";
import GamesLobby from "@/components/games/GamesLobby";

export const dynamic = "force-dynamic";

export default async function GamesPage() {
  const { me, partner } = await requireSession();
  return <GamesLobby me={me} partner={partner} />;
}
