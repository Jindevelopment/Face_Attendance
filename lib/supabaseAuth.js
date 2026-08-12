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

// 현재 로그인 사용자와 소속 조직 목록을 반환한다.
//
// getUser() 를 쓴다 — getSession() 은 쿠키 값을 그대로 신뢰하므로 서버 판정에 부적합하다.
//
// 반환:
//   user           auth 사용자 (없으면 null)
//   memberships    [{ orgId, orgName, role, joinCode }] — joinCode 는 admin 에게만 채워진다
//   activeOrg      현재 조직. 관리자 조직이 있으면 그것을, 없으면 첫 소속을 쓴다
//   isAdmin        activeOrg 에서 관리자인가
export async function getAuthState(cookieStore) {
  const supabase = createServerSupabase(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, memberships: [], activeOrg: null, isAdmin: false };
  }

  const { data, error } = await supabase.rpc("my_memberships");
  if (error) {
    return {
      user,
      memberships: [],
      activeOrg: null,
      isAdmin: false,
      error: error.message,
    };
  }

  const memberships = (data ?? []).map((m) => ({
    orgId: m.org_id,
    orgName: m.org_name,
    role: m.role,
    joinCode: m.join_code, // member 에게는 null 로 내려온다 (0003_organizations.sql)
  }));

  // 한 사람이 여러 조직에 속할 수 있다. 조직 전환 UI 는 아직 없으므로,
  // 관리자 조직을 우선 고른다 — 관리 화면을 열려는 의도가 더 명확하기 때문이다.
  const activeOrg =
    memberships.find((m) => m.role === "admin") ?? memberships[0] ?? null;

  return {
    user,
    memberships,
    activeOrg,
    isAdmin: activeOrg?.role === "admin",
  };
}
