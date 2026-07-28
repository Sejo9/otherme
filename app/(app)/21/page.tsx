import { requireSession } from "@/lib/session";
import TwentyOne from "@/components/q21/TwentyOne";

export const dynamic = "force-dynamic";

export default async function TwentyOnePage() {
  const { me, partner } = await requireSession();
  return <TwentyOne me={me} partner={partner} />;
}
