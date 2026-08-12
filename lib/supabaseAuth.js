// lib/supabaseAuth.js
// 인증용 Supabase 클라이언트 (anon 키 기반, 쿠키에 세션 저장).
//
// lib/supabase.js 의 service_role 클라이언트와 역할이 다르다:
//   - lib/supabase.js      : RLS 우회, 데이터 읽기/쓰기 전담. 절대 브라우저 노출 금지.
//   - lib/supabaseAuth.js  : 로그인/세션 확인 전담. anon 키라 브라우저에 노출돼도 된다.
//
// anon 키로는 users / attendance_logs / anti_spoof_logs 에 접근할 수 없다.
// 0001_init.sql 에서 정책 없이 RLS 를 켜뒀기 때문이다.

import { createBrowserClient, createServerClient } from "@supabase/ssr";

function readEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 필요합니다. " +
        ".env.local 을 확인하고 dev 서버를 재시작하세요."
    );
  }
  return { url, key };
}

// 클라이언트 컴포넌트용 (로그인/가입 폼).
export function createClientSupabase() {
  const { url, key } = readEnv();
  return createBrowserClient(url, key);
}

// Server Component / Route Handler 용. cookies() 결과를 넘겨받는다.
export function createServerSupabase(cookieStore) {
  const { url, key } = readEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Component 에서는 쿠키를 쓸 수 없다. 세션 갱신은 proxy.js 가 담당하므로
          // 여기서는 무시해도 안전하다.
        }
      },
    },
  });
}

// 현재 로그인 사용자와 관리자 여부를 함께 반환한다.
// getUser() 를 쓴다 — getSession() 은 쿠키 값을 그대로 신뢰하므로 서버 판정에 부적합하다.
export async function getAuthState(cookieStore) {
  const supabase = createServerSupabase(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, isAdmin: false };

  const { data, error } = await supabase.rpc("is_admin", { uid: user.id });
  if (error) return { user, isAdmin: false, error: error.message };
  return { user, isAdmin: data === true };
}
