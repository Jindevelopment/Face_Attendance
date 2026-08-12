// 서버 측 인가 확인.
//
// proxy.js 는 "로그인했는가" 까지만 본다. 관리자인지는 여기서 다시 확인한다.
// 판정을 두 군데 두는 이유: proxy 는 CDN 으로 배포될 수 있어 DB 조회를 두기 부적합하고,
// 인가를 한 곳에만 두면 그 경로를 우회당했을 때 남는 방어선이 없다.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthState } from "./supabaseAuth";

// Server Component 용. 관리자가 아니면 리다이렉트한다.
export async function requireAdminPage(currentPath) {
  const cookieStore = await cookies();
  const { user, isAdmin } = await getAuthState(cookieStore);

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(currentPath)}`);
  }
  if (!isAdmin) {
    redirect("/login?error=not_admin");
  }
  return user;
}

// Route Handler 용. 통과하면 null, 막아야 하면 응답 정보를 돌려준다.
export async function checkAdminApi() {
  const cookieStore = await cookies();
  const { user, isAdmin } = await getAuthState(cookieStore);

  if (!user) {
    return { error: "unauthorized", message: "로그인이 필요합니다.", status: 401 };
  }
  if (!isAdmin) {
    return { error: "forbidden", message: "관리자 권한이 필요합니다.", status: 403 };
  }
  return null;
}
