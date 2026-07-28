import { requireSession } from "@/lib/session";
import DailyQuestion from "@/components/question/DailyQuestion";

export const dynamic = "force-dynamic";

export default async function QuestionPage() {
  const { me, partner } = await requireSession();
  return <DailyQuestion me={me} partner={partner} />;
}
