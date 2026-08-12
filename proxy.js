// proxy.js — 라우트 보호 및 세션 갱신.
//
// 이 Next.js 버전에서 middleware 파일 규약은 proxy 로 이름이 바뀌었다
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
//
// 보호 대상:
//   /dashboard  — 등록자 이름·연락처·출결 기록이 보인다
//   /register   — 얼굴 등록. 열려 있으면 아무나 자기 얼굴을 새 사용자로 넣고 출석까지 찍는다
//
// 공개:
//   /attendance — 키오스크 화면. 막으면 용도가 없어진다
//   /api/match, /api/deepface, POST /api/attendance — 키오스크가 쓰는 경로
//
// 주의: 여기서는 "로그인 여부" 까지만 본다. 관리자 여부(is_admin)는 각 페이지와 API
// 라우트에서 다시 확인한다. proxy 는 CDN 에 배포될 수 있어 DB 조회를 두기에 적합하지
// 않고, 무엇보다 인가 판정을 한 곳에만 두면 그 한 곳을 우회당했을 때 방어선이 없다.

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED = ["/dashboard", "/register"];

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const needsAuth = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // 환경변수가 없으면 인증을 판정할 수 없다. 보호 대상이면 열어주지 않고 막는다.
    if (needsAuth) {
      const to = request.nextUrl.clone();
      to.pathname = "/login";
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
    to.pathname = "/login";
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
