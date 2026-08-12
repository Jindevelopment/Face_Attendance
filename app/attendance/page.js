import { requireMember } from "@/lib/guards";
import { countUsers } from "@/lib/db";
import AttendanceClient from "./AttendanceClient";

export const dynamic = "force-dynamic";

export default async function AttendancePage({ searchParams }) {
  const { org } = await requireMember("/attendance");
  const total = await countUsers(org.orgId);

  // 관리 화면에 들어오려다 튕긴 사람이 여기로 온다. 사유를 안 보여주면
  // 왜 갑자기 다른 화면에 와 있는지 알 수 없다.
  // 이 버전에서 searchParams 는 Promise 다 (next/dist/docs .../file-conventions/page.md).
  const { error } = await searchParams;

  return <AttendanceClient orgName={org.orgName} totalUsers={total} notice={error ?? null} />;
}
