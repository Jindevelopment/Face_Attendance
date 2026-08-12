import { NextResponse } from "next/server";
import {
  addAttendanceLog,
  addAntiSpoofLog,
  getAttendanceLogs,
  getAntiSpoofLogs,
  hasRecentAttendance,
} from "@/lib/db";
import { checkOrgAdminApi, checkMemberApi } from "@/lib/guards";
import { verifyMatchToken } from "@/lib/matchToken";

// 로그 조회는 관리자 전용. 기록(POST)은 조직원이면 할 수 있다.
//
// 예전에는 POST 가 완전히 열려 있었다 (키오스크 가정). 이제 사용자도 계정을 갖고
// 로그인해서 출결하므로, 열어 둘 이유가 없어졌다. 로그인은 요구하되, 누구인지는
// 여전히 매칭 증표로만 판정한다 — 로그인 계정과 얼굴이 일치하는지는 별개 문제이고,
// 계정만으로 출석을 인정하면 얼굴 인식을 할 이유가 사라진다.

export async function GET() {
  const auth = await checkOrgAdminApi();
  if (auth.denied) {
    return NextResponse.json(auth.denied, { status: auth.denied.status });
  }
  const orgId = auth.org.orgId;

  return NextResponse.json({
    attendanceLogs: await getAttendanceLogs(orgId),
    antiSpoofLogs: await getAntiSpoofLogs(orgId),
  });
}

export async function POST(request) {
  const auth = await checkMemberApi();
  if (auth.denied) {
    return NextResponse.json(auth.denied, { status: auth.denied.status });
  }
  const orgId = auth.org.orgId;

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

    // 증표에 적힌 조직과 지금 세션의 조직이 같아야 한다.
    // 다르면 A 조직에서 받은 증표로 B 조직에 기록하려는 시도다.
    if (verified.payload.orgId !== orgId) {
      return NextResponse.json(
        {
          error: "org_mismatch",
          message: "다른 조직의 매칭 증표입니다.",
        },
        { status: 403 }
      );
    }

    const { userId, name, distance } = verified.payload;

    if (await hasRecentAttendance(orgId, userId, 5)) {
      return NextResponse.json(
        { status: "DUPLICATE", message: "5분 이내 이미 출결이 기록되었습니다." },
        { status: 200 }
      );
    }
    const log = await addAttendanceLog({
      orgId,
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
    orgId,
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
