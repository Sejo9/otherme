import AppShell from "@/components/AppShell";
import { requireSession } from "@/lib/session";

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const { me } = await requireSession();

  return (
    <AppShell meId={me.id} storedTimezone={me.timezone}>
      {children}
    </AppShell>
  );
}
