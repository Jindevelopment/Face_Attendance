import { NextResponse } from "next/server";
import {
  addAttendanceLog,
  addAntiSpoofLog,
  getAttendanceLogs,
  getAntiSpoofLogs,
  hasRecentAttendance,
} from "@/lib/db";
import { checkAdminApi } from "@/lib/requireAdmin";
import { verifyMatchToken } from "@/lib/matchToken";

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
    matchToken, // /api/match 가 매칭 성공 시에만 발급하는 서명된 증표
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
    // 성공 기록은 "누구인가" 를 요청 본문에서 받지 않는다.
    // 서명된 증표를 검증하고, 사용자 정보와 매칭 거리를 그 안에서 꺼낸다.
    const verified = verifyMatchToken(matchToken);
    if (!verified.ok) {
      const status = verified.reason === "misconfigured" ? 500 : 401;
      return NextResponse.json(
        {
          error: "invalid_match_token",
          reason: verified.reason,
          message:
            verified.reason === "expired"
              ? "매칭 증표가 만료되었습니다. 다시 스캔해주세요."
              : verified.reason === "misconfigured"
                ? verified.message
                : "유효한 매칭 증표가 없습니다. 얼굴 스캔을 거쳐야 출결이 기록됩니다.",
        },
        { status }
      );
    }
    const { userId, name, distance } = verified.payload;

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
      matchDistance: distance, // cosine distance (Facenet512) — 서명에 포함된 값
      deepfaceIsReal,
      deepfaceAntispoofScore,
      challengeSequence: challengeSequence ?? null,
    });
    return NextResponse.json({ status: "SUCCESS", log }, { status: 201 });
  }

  // 위조 의심 / 매칭 실패 -> 이상 탐지 로그로 기록.
  // 이쪽 값들은 검증되지 않은 클라이언트 주장이다. 출결로 이어지지 않는 관찰 기록이므로
  // 그대로 남기되, 신뢰해서 판단에 쓰지는 않는다.
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
    claimedUserId: null, // 매칭 실패 기록이라 확정된 사용자가 없다
    claimedName: null,
  });
  return NextResponse.json({ status: result, log }, { status: 200 });
}
