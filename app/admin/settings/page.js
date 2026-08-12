import { requireOrgAdmin } from "@/lib/guards";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { org } = await requireOrgAdmin("/admin/settings");
  return <SettingsClient orgId={org.orgId} orgName={org.orgName} joinCode={org.joinCode} />;
}
