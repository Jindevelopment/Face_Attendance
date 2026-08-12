// lib/db.js
// Supabase(PostgreSQL) 기반 저장소. 이전 파일 기반 구현(data/db.json)을 대체한다.
//
// 주의: 모든 함수가 async 다. 파일 기반 시절에는 동기 함수였으므로 호출부에 await 가 필요하다.
//
// 컬럼명은 DB 에서 snake_case, 애플리케이션에서는 camelCase 를 쓴다. 매핑은 이 파일이
// 전담해서, 대시보드/스크립트 등 호출부가 쓰던 필드명(timestamp, matchDistance 등)은
// 그대로 유지된다.

import { getSupabase } from "./supabase";

// Facenet512 = 512차원. DB 의 vector(512) 컬럼이 1차 방어선이지만,
// 더 친절한 에러를 위해 애플리케이션에서도 검사한다.
export const CURRENT_EMBEDDING_DIM = 512;

export function isLegacyUser(user) {
  if (!user) return true;
  // Supabase 로 옮긴 뒤에는 vector(512) 제약 때문에 다른 차원이 저장될 수 없다.
  // 이 함수는 마이그레이션 이전 데이터를 다루는 화면을 위해 남겨둔다.
  if (!Array.isArray(user.embedding)) return false;
  return user.embedding.length !== CURRENT_EMBEDDING_DIM;
}

function fail(context, error) {
  throw new Error(`${context} 실패: ${error.message ?? error}`);
}

// --- 행 ↔ 애플리케이션 객체 매핑 ------------------------------------------

function rowToUser(row) {
  return {
    id: row.id,
    name: row.name,
    guardianContact: row.guardian_contact ?? "",
    createdAt: row.created_at,
    // embedding 은 의도적으로 제외한다. 얼굴 벡터가 필요한 곳은 매칭뿐이고,
    // 매칭은 matchFace() 가 DB 안에서 처리한다. 목록 조회 결과에 섞여 들어가
    // API 응답으로 새어나가는 것을 막기 위함.
  };
}

function rowToAttendanceLog(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    timestamp: row.occurred_at,
    livenessPassed: row.liveness_passed,
    blinkDetected: row.blink_detected,
    jitterScore: row.jitter_score,
    syntheticScore: row.synthetic_score,
    matchDistance: row.match_distance,
    deepfaceIsReal: row.deepface_is_real,
    deepfaceAntispoofScore: row.deepface_antispoof_score,
    challengeSequence: row.challenge_sequence,
  };
}

function rowToAntiSpoofLog(row) {
  return {
    ...rowToAttendanceLog(row),
    userId: undefined,
    result: row.result,
    reason: row.reason,
    claimedUserId: row.claimed_user_id,
    claimedName: row.claimed_name,
  };
}

// --- users ----------------------------------------------------------------

// 얼굴 벡터를 제외한 사용자 목록. 대시보드/관리 화면용.
export async function getUsers() {
  const { data, error } = await getSupabase()
    .from("users")
    .select("id, name, guardian_contact, created_at")
    .order("created_at", { ascending: false });
  if (error) fail("사용자 목록 조회", error);
  return data.map(rowToUser);
}

export async function addUser({ name, guardianContact, embedding }) {
  if (!Array.isArray(embedding) || embedding.length !== CURRENT_EMBEDDING_DIM) {
    throw new Error(
      `embedding 은 ${CURRENT_EMBEDDING_DIM}차원 배열이어야 합니다 ` +
        `(받은 값: ${Array.isArray(embedding) ? `${embedding.length}차원` : typeof embedding}).`
    );
  }

  const row = {
    id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    guardian_contact: guardianContact || "",
    embedding,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await getSupabase()
    .from("users")
    .insert(row)
    .select("id, name, guardian_contact, created_at")
    .single();
  if (error) fail("사용자 등록", error);
  return rowToUser(data);
}

export async function deleteUser(id) {
  const { error } = await getSupabase().from("users").delete().eq("id", id);
  if (error) fail("사용자 삭제", error);
}

// --- 얼굴 매칭 -------------------------------------------------------------

// 매칭을 DB 안에서 수행한다 (supabase/migrations/0001_init.sql 의 match_face).
// 이전 구현은 브라우저가 /api/users 로 전원의 embedding 을 내려받아 비교했는데,
// 그 방식은 등록자 전원의 생체정보를 클라이언트에 노출한다.
//
// 반환: 임계값 이내의 최근접 사용자 { id, name, distance } 또는 null.
export async function matchFace(embedding, threshold) {
  if (!Array.isArray(embedding) || embedding.length !== CURRENT_EMBEDDING_DIM) {
    throw new Error(`매칭에는 ${CURRENT_EMBEDDING_DIM}차원 embedding 이 필요합니다.`);
  }
  const { data, error } = await getSupabase().rpc("match_face", {
    query_embedding: embedding,
    match_threshold: threshold,
  });
  if (error) fail("얼굴 매칭", error);
  if (!data || data.length === 0) return null;
  const best = data[0];
  return { id: best.id, name: best.name, distance: best.distance };
}

// 등록된 사용자 수. 매칭 실패 시 "등록자가 아예 없는 것인지" 구분하는 용도.
export async function countUsers() {
  const { count, error } = await getSupabase()
    .from("users")
    .select("id", { count: "exact", head: true });
  if (error) fail("사용자 수 조회", error);
  return count ?? 0;
}

// --- 로그 ------------------------------------------------------------------

export async function getAttendanceLogs() {
  const { data, error } = await getSupabase()
    .from("attendance_logs")
    .select("*")
    .order("occurred_at", { ascending: false });
  if (error) fail("출결 로그 조회", error);
  return data.map(rowToAttendanceLog);
}

export async function addAttendanceLog(log) {
  const row = {
    id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    user_id: log.userId ?? null,
    name: log.name ?? null,
    occurred_at: new Date().toISOString(),
    liveness_passed: log.livenessPassed ?? null,
    blink_detected: log.blinkDetected ?? null,
    jitter_score: log.jitterScore ?? null,
    synthetic_score: log.syntheticScore ?? null,
    match_distance: log.matchDistance ?? null,
    deepface_is_real: log.deepfaceIsReal ?? null,
    deepface_antispoof_score: log.deepfaceAntispoofScore ?? null,
    challenge_sequence: log.challengeSequence ?? null,
  };
  const { data, error } = await getSupabase()
    .from("attendance_logs")
    .insert(row)
    .select("*")
    .single();
  if (error) fail("출결 기록", error);
  return rowToAttendanceLog(data);
}

export async function getAntiSpoofLogs() {
  const { data, error } = await getSupabase()
    .from("anti_spoof_logs")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(500);
  if (error) fail("이상 탐지 로그 조회", error);
  return data.map(rowToAntiSpoofLog);
}

export async function addAntiSpoofLog(log) {
  const row = {
    id: `spoof_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    occurred_at: new Date().toISOString(),
    result: log.result,
    reason: log.reason ?? null,
    liveness_passed: log.livenessPassed ?? null,
    blink_detected: log.blinkDetected ?? null,
    jitter_score: log.jitterScore ?? null,
    synthetic_score: log.syntheticScore ?? null,
    match_distance: log.matchDistance ?? null,
    deepface_is_real: log.deepfaceIsReal ?? null,
    deepface_antispoof_score: log.deepfaceAntispoofScore ?? null,
    challenge_sequence: log.challengeSequence ?? null,
    claimed_user_id: log.claimedUserId ?? null,
    claimed_name: log.claimedName ?? null,
  };
  const { data, error } = await getSupabase()
    .from("anti_spoof_logs")
    .insert(row)
    .select("*")
    .single();
  if (error) fail("이상 탐지 기록", error);
  return rowToAntiSpoofLog(data);
}

// 마지막 출결 시각 대비 중복 체크 (분 단위).
// 파일 기반 시절에는 전체 로그를 읽어 정렬했으나, 이제 인덱스로 1건만 조회한다.
export async function hasRecentAttendance(userId, withinMinutes = 5) {
  if (!userId) return false;
  const since = new Date(Date.now() - withinMinutes * 60 * 1000).toISOString();
  const { data, error } = await getSupabase()
    .from("attendance_logs")
    .select("id")
    .eq("user_id", userId)
    .gte("occurred_at", since)
    .limit(1);
  if (error) fail("중복 출결 확인", error);
  return (data?.length ?? 0) > 0;
}
