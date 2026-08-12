import { requireMember } from "@/lib/guards";
import { countUsers } from "@/lib/db";
import AttendanceClient from "./AttendanceClient";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const { org } = await requireMember("/attendance");
  const total = await countUsers(org.orgId);

  return <AttendanceClient orgName={org.orgName} totalUsers={total} />;
}
