// lib/supabase.js
// 서버 전용 Supabase 클라이언트.
//
// service_role 키는 RLS 를 우회하는 마스터 키다. 절대 NEXT_PUBLIC_ 접두사를 붙이지 말 것.
// Next.js 는 NEXT_PUBLIC_ 이 없는 환경변수를 브라우저 번들에 인라인하지 않으므로
// (node_modules/next/dist/docs/01-app/02-guides/environment-variables.md),
// 이 파일을 import 하는 코드는 서버(Route Handler / Server Component)에서만 실행돼야 한다.

import { createClient } from "@supabase/supabase-js";

let client = null;

function readEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!key) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    throw new Error(
      `Supabase 환경변수가 없습니다: ${missing.join(", ")}. ` +
        `프로젝트 루트에 .env.local 을 만들고 값을 채운 뒤 dev 서버를 재시작하세요 ` +
        `(.env.local 은 .gitignore 에 포함되어 커밋되지 않습니다).`
    );
  }
  return { url, key };
}

// 모듈 로드 시점이 아니라 첫 호출 때 초기화한다.
// 환경변수가 없는 상태에서 next build 가 이 모듈을 스캔하다 실패하는 것을 막기 위함.
export function getSupabase() {
  if (client) return client;

  if (typeof window !== "undefined") {
    // 방어선: 브라우저에서 이 모듈이 실행되면 service_role 키가 유출됐다는 뜻이다.
    throw new Error(
      "lib/supabase.js 는 서버 전용입니다. 클라이언트 컴포넌트에서 import 하지 마세요."
    );
  }

  const { url, key } = readEnv();
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
