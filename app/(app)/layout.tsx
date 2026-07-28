import AppShell from "@/components/AppShell";
import { requireSession } from "@/lib/session";

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return <AppShell>{children}</AppShell>;
}
