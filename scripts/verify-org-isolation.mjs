// 조직 격리 검증.
//
// 멀티테넌트에서 가장 위험한 실패는 "남의 조직 데이터가 보이는 것" 이고,
// 이 도메인에서는 한 단계 더 나쁘다. 다른 조직 사람의 얼굴과 매칭되면
// 그 순간 남의 출결이 기록된다.
//
// 두 번째 조직을 임시로 만들어 아래를 확인하고, 끝나면 전부 지운다.
//
//   node --env-file=.env.local scripts/verify-org-isolation.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !serviceKey || !anonKey) {
  console.error("환경변수가 없습니다. --env-file=.env.local 로 실행하세요.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const TEST_EMAIL = "qa-isolation@facegate-e2e-9f3a2b.com";
const TEST_PASSWORD = "QaIsolation!ThrowAway2026";

let failures = 0;
function check(label, ok, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

// --- 정리 (이전 실행 잔여물 포함) -------------------------------------------
async function cleanup(quiet = false) {
  const {
    data: { users },
  } = await admin.auth.admin.listUsers();
  const t = users.find((u) => u.email === TEST_EMAIL);
  if (t) {
    // organizations.owner_id 가 on delete cascade 라 조직과 멤버십도 함께 지워진다.
    await admin.auth.admin.deleteUser(t.id);
    if (!quiet) console.log("  임시 계정/조직 삭제됨");
  }
}

console.log("0) 이전 잔여물 정리");
await cleanup();

// --- 1. 기존(A) 조직 상태 파악 ----------------------------------------------
console.log("\n1) 기존 조직 확인");
const { data: orgsA } = await admin
  .from("organizations")
  .select("id, name")
  .order("created_at")
  .limit(1);
if (!orgsA?.length) {
  console.error("조직이 없습니다. 먼저 관리자로 조직을 만드세요.");
  process.exit(1);
}
const orgA = orgsA[0];
const { data: usersA } = await admin
  .from("users")
  .select("id, name, embedding")
  .eq("org_id", orgA.id);
console.log(`  A 조직: ${orgA.name} (등록 ${usersA.length}명)`);
if (!usersA.length) {
  console.error("A 조직에 등록된 얼굴이 없어 매칭 격리를 검증할 수 없습니다.");
  process.exit(1);
}
const faceA = usersA[0];
const embA =
  typeof faceA.embedding === "string" ? JSON.parse(faceA.embedding) : faceA.embedding;

// --- 2. 두 번째 조직(B) 만들기 ----------------------------------------------
// 메일 발송을 타지 않도록 관리자 API 로 만들고(email_confirm), 로그인해서 세션을 얻는다.
// create_organization 은 auth.uid() 를 쓰므로 반드시 사용자 세션으로 호출해야 한다.
console.log("\n2) 두 번째 조직 생성");
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
  email_confirm: true,
});
if (createErr) {
  console.error("  임시 계정 생성 실패:", createErr.message);
  process.exit(1);
}

const asUser = createClient(url, anonKey, { auth: { persistSession: false } });
const { error: signInErr } = await asUser.auth.signInWithPassword({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
});
if (signInErr) {
  console.error("  임시 계정 로그인 실패:", signInErr.message);
  await cleanup();
  process.exit(1);
}

const { data: createdOrg, error: rpcErr } = await asUser.rpc("create_organization", {
  org_name: "QA 격리 테스트 조직",
});
if (rpcErr) {
  console.error("  조직 생성 RPC 실패:", rpcErr.message);
  await cleanup();
  process.exit(1);
}
const orgB = Array.isArray(createdOrg) ? createdOrg[0] : createdOrg;
console.log(`  B 조직 생성됨 (인증코드 ${orgB.o_join_code})`);
check("create_organization 이 o_ 접두사 컬럼을 돌려준다", Boolean(orgB.o_org_id));

// --- 3. 격리 검증 -----------------------------------------------------------
console.log("\n3) 격리 검증");

// 3-1. B 관리자의 소속 목록에 A 조직이 없어야 한다
const { data: ms } = await asUser.rpc("my_memberships");
const orgIds = (ms ?? []).map((m) => m.org_id);
check(
  "B 관리자의 소속에 A 조직이 없다",
  !orgIds.includes(orgA.id),
  `소속 ${orgIds.length}개`
);

// 3-2. B 조직의 등록자 목록에 A 사람이 없어야 한다
const { data: usersB } = await admin.from("users").select("id, name").eq("org_id", orgB.o_org_id);
check(
  "B 조직 등록자 목록이 비어 있다",
  (usersB?.length ?? 0) === 0,
  `${usersB?.length ?? 0}명`
);

// 3-3. 가장 중요: A 조직 사람의 얼굴이 B 조직에서 매칭되면 안 된다.
//      매칭되면 남의 조직에서 그 사람 출결이 찍힌다.
const { data: matchInB, error: matchBErr } = await admin.rpc("match_face_in_org", {
  target_org: orgB.o_org_id,
  query_embedding: embA,
  match_threshold: 0.25,
});
check(
  "A 조직 사람의 얼굴이 B 조직에서 매칭되지 않는다",
  !matchBErr && (matchInB?.length ?? 0) === 0,
  matchBErr ? matchBErr.message : `결과 ${matchInB?.length ?? 0}건`
);

// 3-4. 대조군: 같은 얼굴이 A 조직에서는 매칭돼야 한다.
//      이게 실패하면 위 결과는 "격리가 됐다" 가 아니라 "매칭 자체가 고장" 이다.
const { data: matchInA } = await admin.rpc("match_face_in_org", {
  target_org: orgA.id,
  query_embedding: embA,
  match_threshold: 0.25,
});
check(
  "같은 얼굴이 A 조직에서는 매칭된다 (대조군)",
  (matchInA?.length ?? 0) === 1 && matchInA[0].id === faceA.id,
  `${matchInA?.[0]?.name ?? "없음"} / 거리 ${matchInA?.[0]?.distance?.toFixed(6) ?? "-"}`
);

// 3-5. anon 키(로그인 사용자 권한)로는 users 테이블을 못 읽어야 한다
const { data: leak, error: leakErr } = await asUser.from("users").select("id, name");
check(
  "로그인 사용자 권한으로 users 테이블을 읽을 수 없다",
  (leak?.length ?? 0) === 0,
  leakErr ? `차단됨 (${leakErr.code ?? "RLS"})` : `${leak?.length ?? 0}행 반환`
);

// 3-6. 남의 조직 인증코드를 볼 수 없어야 한다
const { data: orgLeak } = await asUser.from("organizations").select("id, name, join_code");
const sawOtherOrg = (orgLeak ?? []).some((o) => o.id === orgA.id);
check("남의 조직 정보를 조회할 수 없다", !sawOtherOrg, `${orgLeak?.length ?? 0}개 조회됨`);

// --- 4. 정리 ---------------------------------------------------------------
console.log("\n4) 정리");
await cleanup();

console.log(
  `\n${failures === 0 ? "✅ 조직 격리가 모두 확인되었습니다." : `❌ ${failures}건 실패 — 격리에 구멍이 있습니다.`}`
);
process.exit(failures === 0 ? 0 : 1);
