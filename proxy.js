// proxy.js — 라우트 보호 및 세션 갱신.
//
// 이 Next.js 버전에서 middleware 파일 규약은 proxy 로 이름이 바뀌었다
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
//
// 보호 대상:
//   /admin/*    — 대시보드·등록 관리·인증코드 (단, /admin/login 과 /admin/signup 은 제외)
//   /attendance — 출결 체크. 이제 참여자도 계정을 갖는다
//   /me         — 내 기록
//   /start      — 로그인 직후 조직을 정하는 화면
//
// 공개:
//   /, /login, /join, /admin/login, /admin/signup
//   /api/deepface — 얼굴 분석 프록시. 여기서 막지 않고 라우트가 자체 판단한다
//
// 주의: 여기서는 "로그인 여부" 까지만 본다. 조직 소속과 역할은 각 페이지와 API
// 라우트에서 다시 확인한다 (lib/guards.js). proxy 는 CDN 에 배포될 수 있어 DB 조회를
// 두기에 적합하지 않고, 무엇보다 인가 판정을 한 곳에만 두면 그 한 곳을 우회당했을 때
// 방어선이 없다.

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED = ["/admin", "/attendance", "/me", "/start"];
// 로그인 전에 볼 수 있어야 하는 예외. PROTECTED 보다 우선한다.
const PUBLIC_EXCEPTIONS = ["/admin/login", "/admin/signup"];

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const isException = PUBLIC_EXCEPTIONS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  const needsAuth =
    !isException &&
    PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // 관리 화면은 관리자 로그인으로, 나머지는 참여자 로그인으로 보낸다.
  // 한쪽으로 몰면 참여자가 관리자 화면을 보게 되거나 그 반대가 된다.
  const loginPath = pathname.startsWith("/admin") ? "/admin/login" : "/login";

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // 환경변수가 없으면 인증을 판정할 수 없다. 보호 대상이면 열어주지 않고 막는다.
    if (needsAuth) {
      const to = request.nextUrl.clone();
      to.pathname = loginPath;
      to.searchParams.set("error", "config");
      return NextResponse.redirect(to);
    }
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // getUser() 는 토큰을 Supabase 에 검증시킨다. 동시에 만료된 세션을 갱신해
  // 위 setAll 을 통해 응답 쿠키에 반영한다. 이 호출을 빼면 세션이 조용히 만료된다.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (needsAuth && !user) {
    const to = request.nextUrl.clone();
    to.pathname = loginPath;
    to.searchParams.set("next", pathname);
    return NextResponse.redirect(to);
  }

  return response;
}

export const config = {
  // 정적 자산과 face-api.js 모델 파일은 건너뛴다 (모델은 수 MB라 매 요청 검사할 이유가 없다).
  matcher: [
    "/((?!_next/static|_next/image|models/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
