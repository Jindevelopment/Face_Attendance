// data/db.json → Supabase 일회성 마이그레이션.
//
// 사용법 (프로젝트 루트에서):
//   node --env-file=.env.local scripts/migrate-json-to-supabase.mjs --dry-run
//   node --env-file=.env.local scripts/migrate-json-to-supabase.mjs
//
// --dry-run 은 무엇이 옮겨질지만 출력하고 쓰지 않는다. 먼저 이걸로 확인할 것.
//
// 512차원이 아닌 레거시 사용자(face-api.js 128-d descriptor)는 건너뛴다.
// vector(512) 컬럼에 넣을 수 없고, 넣더라도 매칭이 불가능하기 때문이다.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");
const DB_PATH = path.join(process.cwd(), "data", "db.json");
const EMBEDDING_DIM = 512;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "환경변수가 없습니다. .env.local 에 NEXT_PUBLIC_SUPABASE_URL 과 " +
      "SUPABASE_SERVICE_ROLE_KEY 를 설정하고, --env-file=.env.local 로 실행하세요."
  );
  process.exit(1);
}
if (!fs.existsSync(DB_PATH)) {
  console.error(`db.json 이 없습니다: ${DB_PATH}`);
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));

const users = db.users ?? [];
const migratableUsers = users.filter(
  (u) => Array.isArray(u.embedding) && u.embedding.length === EMBEDDING_DIM
);
const skipped = users.filter((u) => !migratableUsers.includes(u));

console.log(`사용자        : ${users.length}명 중 ${migratableUsers.length}명 이전 가능`);
for (const u of skipped) {
  const dim = Array.isArray(u.embedding)
    ? `${u.embedding.length}차원`
    : Array.isArray(u.descriptor)
      ? `구버전 descriptor ${u.descriptor.length}차원`
      : "embedding 없음";
  console.log(`  건너뜀: ${u.name} (${dim}) — 재등록 필요`);
}
console.log(`출결 로그     : ${(db.attendanceLogs ?? []).length}건`);
console.log(`이상 탐지 로그 : ${(db.antiSpoofLogs ?? []).length}건`);

if (DRY_RUN) {
  console.log("\n--dry-run 이므로 아무것도 쓰지 않았습니다.");
  process.exit(0);
}

async function upsert(table, rows, label) {
  if (rows.length === 0) {
    console.log(`${label}: 옮길 것 없음`);
    return;
  }
  // 재실행해도 중복되지 않도록 id 기준 upsert.
  const { error } = await supabase.from(table).upsert(rows, { onConflict: "id" });
  if (error) {
    console.error(`${label} 실패: ${error.message}`);
    process.exit(1);
  }
  console.log(`${label}: ${rows.length}건 완료`);
}

await upsert(
  "users",
  migratableUsers.map((u) => ({
    id: u.id,
    name: u.name,
    guardian_contact: u.guardianContact ?? "",
    embedding: u.embedding,
    created_at: u.createdAt ?? new Date().toISOString(),
  })),
  "users"
);

// 외래키 때문에 옮겨지지 않은 사용자를 참조하는 로그는 user_id 를 null 로 둔다.
const migratedIds = new Set(migratableUsers.map((u) => u.id));

await upsert(
  "attendance_logs",
  (db.attendanceLogs ?? []).map((l) => ({
    id: l.id,
    user_id: migratedIds.has(l.userId) ? l.userId : null,
    name: l.name ?? null,
    occurred_at: l.timestamp,
    liveness_passed: l.livenessPassed ?? null,
    blink_detected: l.blinkDetected ?? null,
    jitter_score: l.jitterScore ?? null,
    synthetic_score: l.syntheticScore ?? null,
    match_distance: l.matchDistance ?? null,
    deepface_is_real: l.deepfaceIsReal ?? null,
    deepface_antispoof_score: l.deepfaceAntispoofScore ?? null,
    challenge_sequence: l.challengeSequence ?? null,
  })),
  "attendance_logs"
);

await upsert(
  "anti_spoof_logs",
  (db.antiSpoofLogs ?? []).map((l) => ({
    id: l.id,
    occurred_at: l.timestamp,
    result: l.result ?? "REJECTED_UNKNOWN",
    reason: l.reason ?? null,
    liveness_passed: l.livenessPassed ?? null,
    blink_detected: l.blinkDetected ?? null,
    jitter_score: l.jitterScore ?? null,
    synthetic_score: l.syntheticScore ?? null,
    match_distance: l.matchDistance ?? null,
    deepface_is_real: l.deepfaceIsReal ?? null,
    deepface_antispoof_score: l.deepfaceAntispoofScore ?? null,
    challenge_sequence: l.challengeSequence ?? null,
    claimed_user_id: migratedIds.has(l.claimedUserId) ? l.claimedUserId : null,
    claimed_name: l.claimedName ?? null,
  })),
  "anti_spoof_logs"
);

console.log("\n완료. data/db.json 은 그대로 두었습니다 (문제 시 되돌릴 수 있도록).");
