import { requireSession } from "@/lib/session";
import Chat from "@/components/chat/Chat";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const { me, partner } = await requireSession();
  return <Chat me={me} partner={partner} />;
}
