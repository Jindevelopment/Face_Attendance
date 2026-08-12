import { getUsers, isLegacyUser } from "@/lib/db";
import { requireOrgAdmin } from "@/lib/guards";
import MembersClient from "./MembersClient";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const { org } = await requireOrgAdmin("/admin/members");
  const users = await getUsers(org.orgId);

  return (
    <MembersClient
      orgName={org.orgName}
      joinCode={org.joinCode}
      users={users.map((u) => ({
        id: u.id,
        name: u.name,
        guardianContact: u.guardianContact,
        createdAt: u.createdAt,
        selfEnrolled: Boolean(u.authUserId),
        legacy: isLegacyUser(u),
      }))}
    />
  );
}
