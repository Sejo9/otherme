import Link from "next/link";
import { requireSession } from "@/lib/session";
import SettingsForm from "@/components/settings/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { me, partner, settings } = await requireSession();

  return (
    <>
      <header className="mb-5 pt-2">
        <Link href="/" className="text-sm text-ink-faint">
          ← Today
        </Link>
        <h1 className="mt-2 font-serif text-2xl">Settings</h1>
      </header>

      <SettingsForm me={me} partner={partner} settings={settings} />
    </>
  );
}
