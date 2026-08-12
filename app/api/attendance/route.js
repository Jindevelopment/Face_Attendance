import { NextResponse } from "next/server";
import {
  addAttendanceLog,
  addAntiSpoofLog,
  getAttendanceLogs,
  getAntiSpoofLogs,
  hasRecentAttendance,
} from "@/lib/db";
import { checkAdminApi } from "@/lib/requireAdmin";

// 로그 조회는 관리자 전용. POST(기록)는 키오스크가 호출하므로 열어둔다.
export async function GET() {
  const denied = await checkAdminApi();
  if (denied) return NextResponse.json(denied, { status: denied.status });

  return NextResponse.json({
    attendanceLogs: await getAttendanceLogs(),
    antiSpoofLogs: await getAntiSpoofLogs(),
  });
}

export async function POST(request) {
  const body = await request.json();
  const {
    userId,
    name,
    livenessPassed,
    blinkDetected,
    jitterScore,
    syntheticScore,
    matchDistance,
    deepfaceIsReal,
    deepfaceAntispoofScore,
    challengeSequence, // 이번 스캔에서 무작위로 뽑힌 능동 챌린지 방향 배열 (예: ["left","right"])
    result, // "SUCCESS" | "REJECTED_SPOOF" | "REJECTED_NO_MATCH"
    reason,
  } = body;

  // 기록 시각은 lib/db.js 가 occurred_at 에 직접 채운다.

  if (result === "SUCCESS") {
    if (!userId) {
      return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });
    }
    if (await hasRecentAttendance(userId, 5)) {
      return NextResponse.json(
        { status: "DUPLICATE", message: "5분 이내 이미 출결이 기록되었습니다." },
        { status: 200 }
      );
    }
    const log = await addAttendanceLog({
      userId,
      name,
      livenessPassed,
      blinkDetected,
      jitterScore,
      syntheticScore,
      matchDistance, // cosine distance (Facenet512)
      deepfaceIsReal,
      deepfaceAntispoofScore,
      challengeSequence: challengeSequence ?? null,
    });
    return NextResponse.json({ status: "SUCCESS", log }, { status: 201 });
  }

  // 위조 의심 / 매칭 실패 -> 이상 탐지 로그로 기록
  const log = await addAntiSpoofLog({
    result: result || "REJECTED_UNKNOWN",
    reason: reason || "",
    livenessPassed,
    blinkDetected,
    jitterScore,
    syntheticScore,
    matchDistance,
    deepfaceIsReal,
    deepfaceAntispoofScore,
    challengeSequence: challengeSequence ?? null,
    claimedUserId: userId || null,
    claimedName: name || null,
  });
  return NextResponse.json({ status: result, log }, { status: 200 });
}
