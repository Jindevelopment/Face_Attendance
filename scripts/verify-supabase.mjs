// Supabase 스키마/함수 존재 확인. 비밀값은 출력하지 않는다.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log("환경변수:");
console.log(`  URL              : ${url ? url : "없음"}`);
console.log(`  SERVICE_ROLE_KEY : ${key ? `설정됨 (길이 ${key.length})` : "없음"}`);
console.log(`  ANON_KEY         : ${anon ? `설정됨 (길이 ${anon.length})` : "없음"}`);
if (!url || !key) process.exit(1);

const sb = createClient(url, key, { auth: { persistSession: false } });

console.log("\n테이블:");
for (const t of ["users", "attendance_logs", "anti_spoof_logs", "admins"]) {
  const { count, error } = await sb.from(t).select("*", { count: "exact", head: true });
  console.log(`  ${t.padEnd(17)}: ${error ? `❌ ${error.message}` : `✅ ${count}행`}`);
}

console.log("\n함수:");
// match_face: 0으로 채운 512차원 벡터로 호출 (결과보다 호출 성공 여부가 관심사)
const zero = new Array(512).fill(0);
const { error: mfErr } = await sb.rpc("match_face", {
  query_embedding: zero,
  match_threshold: 0.25,
});
console.log(`  match_face       : ${mfErr ? `❌ ${mfErr.message}` : "✅ 호출 가능"}`);

const { data: adminData, error: adErr } = await sb.rpc("is_admin", {
  uid: "00000000-0000-0000-0000-000000000000",
});
console.log(`  is_admin         : ${adErr ? `❌ ${adErr.message}` : `✅ 호출 가능 (더미 uid → ${adminData})`}`);

console.log("\n관리자 등록 현황:");
const { data: admins, error: aErr } = await sb.from("admins").select("email, note, created_at");
if (aErr) console.log(`  ❌ ${aErr.message}`);
else if (!admins.length) console.log("  ⚠️  없음 — 아직 아무도 관리자가 아닙니다");
else admins.forEach((a) => console.log(`  ✅ ${a.email} (${a.note ?? "-"})`));

console.log("\nusers 데이터:");
const { data: users, error: uErr } = await sb.from("users").select("id, name, created_at");
if (uErr) console.log(`  ❌ ${uErr.message}`);
else if (!users.length) console.log("  (비어 있음 — 마이그레이션 스크립트 미실행)");
else users.forEach((u) => console.log(`  - ${u.name}`));
