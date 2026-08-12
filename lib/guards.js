// 서버 측 인가 확인.
//
// proxy.js 는 "로그인했는가" 까지만 본다. 조직 소속과 역할은 여기서 다시 확인한다.
// 판정을 두 군데 두는 이유: proxy 는 CDN 으로 배포될 수 있어 DB 조회를 두기 부적합하고,
// 인가를 한 곳에만 두면 그 경로를 우회당했을 때 남는 방어선이 없다.
//
// 조직이 생긴 뒤로는 "관리자인가" 만으로는 부족하다. 어느 조직의 관리자인지가 중요하다.
// 모든 데이터 조회는 여기서 돌려주는 orgId 로 좁혀야 한다.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthState } from "./supabaseAuth";

// Server Component 용. 관리자가 아니면 리다이렉트한다.
// 반환: { user, org } — org 는 { orgId, orgName, role, joinCode }
export async function requireOrgAdmin(currentPath) {
  const cookieStore = await cookies();
  const { user, activeOrg, memberships } = await getAuthState(cookieStore);

  if (!user) {
    redirect(`/admin/login?next=${encodeURIComponent(currentPath)}`);
  }
  // 로그인은 했는데 조직이 하나도 없다 = 아직 조직을 만들지도, 참여하지도 않았다.
  if (memberships.length === 0) {
    redirect("/start");
  }
  if (activeOrg?.role !== "admin") {
    // 사용자 계정으로 관리 화면에 들어온 경우. 로그인 화면이 아니라
    // 본인이 쓸 수 있는 화면으로 보낸다.
    redirect("/attendance?error=not_admin");
  }
  return { user, org: activeOrg };
}

// 로그인 + 조직 소속만 요구한다 (역할 무관). 출결 화면용.
export async function requireMember(currentPath) {
  const cookieStore = await cookies();
  const { user, activeOrg, memberships } = await getAuthState(cookieStore);

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(currentPath)}`);
  }
  if (memberships.length === 0) {
    redirect("/start");
  }
  return { user, org: activeOrg };
}

// Route Handler 용. 통과하면 { user, org }, 막아야 하면 { denied: {...} }.
export async function checkOrgAdminApi() {
  const cookieStore = await cookies();
  const { user, activeOrg, memberships } = await getAuthState(cookieStore);

  if (!user) {
    return { denied: { error: "unauthorized", message: "로그인이 필요합니다.", status: 401 } };
  }
  if (memberships.length === 0) {
    return {
      denied: { error: "no_organization", message: "소속된 조직이 없습니다.", status: 403 },
    };
  }
  if (activeOrg?.role !== "admin") {
    return {
      denied: { error: "forbidden", message: "관리자 권한이 필요합니다.", status: 403 },
    };
  }
  return { user, org: activeOrg };
}

// 로그인한 조직원이면 통과. 출결 기록 API 처럼 member 도 써야 하는 곳에 쓴다.
export async function checkMemberApi() {
  const cookieStore = await cookies();
  const { user, activeOrg, memberships } = await getAuthState(cookieStore);

  if (!user) {
    return { denied: { error: "unauthorized", message: "로그인이 필요합니다.", status: 401 } };
  }
  if (memberships.length === 0) {
    return {
      denied: { error: "no_organization", message: "소속된 조직이 없습니다.", status: 403 },
    };
  }
  return { user, org: activeOrg };
}
