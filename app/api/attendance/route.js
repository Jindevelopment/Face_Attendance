import { NextResponse } from "next/server";
import {
  addAttendanceLog,
  addAntiSpoofLog,
  getAttendanceLogs,
  getAntiSpoofLogs,
  hasRecentAttendance,
} from "@/lib/db";

export async function GET() {
  return NextResponse.json({
    attendanceLogs: getAttendanceLogs(),
    antiSpoofLogs: getAntiSpoofLogs(),
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
    result, // "SUCCESS" | "REJECTED_SPOOF" | "REJECTED_NO_MATCH"
    reason,
  } = body;

  const timestamp = new Date().toISOString();

  if (result === "SUCCESS") {
    if (!userId) {
      return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });
    }
    if (hasRecentAttendance(userId, 5)) {
      return NextResponse.json(
        { status: "DUPLICATE", message: "5분 이내 이미 출결이 기록되었습니다." },
        { status: 200 }
      );
    }
    const log = addAttendanceLog({
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      name,
      timestamp,
      livenessPassed,
      blinkDetected,
      jitterScore,
      syntheticScore,
      matchDistance,
    });
    return NextResponse.json({ status: "SUCCESS", log }, { status: 201 });
  }

  // 위조 의심 / 매칭 실패 -> 이상 탐지 로그로 기록
  const log = addAntiSpoofLog({
    id: `spoof_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
    result: result || "REJECTED_UNKNOWN",
    reason: reason || "",
    livenessPassed,
    blinkDetected,
    jitterScore,
    syntheticScore,
    matchDistance,
    claimedUserId: userId || null,
    claimedName: name || null,
  });
  return NextResponse.json({ status: result, log }, { status: 200 });
}
