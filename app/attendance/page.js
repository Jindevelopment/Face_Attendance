"use client";

import { useState } from "react";
import * as faceapi from "face-api.js";
import FaceCapture from "@/components/FaceCapture";

const MATCH_DISTANCE_THRESHOLD = 0.5; // 낮을수록 엄격 (face-api.js 권장 기본값)

export default function AttendancePage() {
  const [status, setStatus] = useState(null); // { type: 'success'|'spoof'|'no_match'|'duplicate', ... }
  const [processing, setProcessing] = useState(false);
  const [scanKey, setScanKey] = useState(0);

  async function handleCapture(metrics) {
    setProcessing(true);
    setStatus(null);
    try {
      // 1) 위조 판별 우선 (얼굴 매칭보다 먼저 수행)
      if (!metrics.livenessPassed) {
        await logResult({
          result: "REJECTED_SPOOF",
          reason: "라이브니스 판별 실패 (사진/화면 재생 의심)",
          metrics,
        });
        setStatus({
          type: "spoof",
          title: "실물 판별 실패",
          desc: "사진 또는 화면 재생으로 의심됩니다. 실제 얼굴로 다시 시도해주세요.",
        });
        return;
      }
      if (metrics.syntheticSuspect) {
        await logResult({
          result: "REJECTED_SPOOF",
          reason: "AI 생성 이미지 의심 (synthetic score 임계 초과)",
          metrics,
        });
        setStatus({
          type: "spoof",
          title: "AI 생성 이미지 의심",
          desc: `합성 이미지 의심 점수 ${metrics.syntheticScore}/100 — 임계값을 초과했습니다.`,
        });
        return;
      }

      // 2) 얼굴 매칭
      const res = await fetch("/api/users");
      const { users } = await res.json();
      if (!users || users.length === 0) {
        setStatus({ type: "no_match", title: "등록된 사용자 없음", desc: "먼저 얼굴을 등록해주세요." });
        return;
      }

      const inputDescriptor = new Float32Array(metrics.descriptor);
      let best = null;
      for (const u of users) {
        const d = faceapi.euclideanDistance(inputDescriptor, new Float32Array(u.descriptor));
        if (!best || d < best.distance) best = { user: u, distance: d };
      }

      if (!best || best.distance > MATCH_DISTANCE_THRESHOLD) {
        await logResult({
          result: "REJECTED_NO_MATCH",
          reason: `매칭 실패 (최소 거리 ${best ? best.distance.toFixed(3) : "N/A"})`,
          metrics,
        });
        setStatus({
          type: "no_match",
          title: "일치하는 사용자 없음",
          desc: "등록된 얼굴과 일치하지 않습니다.",
        });
        return;
      }

      // 3) 출결 기록
      const attRes = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: best.user.id,
          name: best.user.name,
          livenessPassed: metrics.livenessPassed,
          blinkDetected: metrics.blinkDetected,
          jitterScore: metrics.jitterScore,
          syntheticScore: metrics.syntheticScore,
          matchDistance: Number(best.distance.toFixed(4)),
          result: "SUCCESS",
        }),
      });
      const attData = await attRes.json();

      if (attData.status === "DUPLICATE") {
        setStatus({
          type: "duplicate",
          title: `${best.user.name}님`,
          desc: "이미 최근에 출결이 기록되었습니다 (5분 이내 중복 방지).",
        });
      } else {
        setStatus({
          type: "success",
          title: `${best.user.name}님 출석 완료`,
          desc: `매칭 거리 ${best.distance.toFixed(3)} · 위조판별 통과`,
        });
      }
    } catch (e) {
      setStatus({ type: "no_match", title: "오류 발생", desc: e.message });
    } finally {
      setProcessing(false);
      setScanKey((k) => k + 1);
    }
  }

  async function logResult({ result, reason, metrics }) {
    await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        livenessPassed: metrics.livenessPassed,
        blinkDetected: metrics.blinkDetected,
        jitterScore: metrics.jitterScore,
        syntheticScore: metrics.syntheticScore,
        result,
        reason,
      }),
    });
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>출결 체크</h1>
      <p style={{ color: "var(--text-dim)", fontSize: 14, marginTop: 6, marginBottom: 32 }}>
        카메라 앞에 정면으로 서서 스캔 버튼을 눌러주세요. 위조 판별을 통과한 경우에만 출결이 기록됩니다.
      </p>

      <FaceCapture key={scanKey} actionLabel={processing ? "처리 중..." : "출결 스캔"} onCapture={handleCapture} />

      {status && <StatusPanel status={status} />}
    </div>
  );
}

function StatusPanel({ status }) {
  const palette = {
    success: { bg: "rgba(52,216,176,0.08)", border: "var(--accent-verify)", color: "var(--accent-verify)" },
    spoof: { bg: "rgba(255,84,112,0.08)", border: "var(--accent-danger)", color: "var(--accent-danger)" },
    no_match: { bg: "rgba(245,166,35,0.08)", border: "var(--accent-warn)", color: "var(--accent-warn)" },
    duplicate: { bg: "rgba(245,166,35,0.08)", border: "var(--accent-warn)", color: "var(--accent-warn)" },
  }[status.type];

  return (
    <div
      style={{
        marginTop: 24,
        padding: 18,
        borderRadius: 10,
        border: `1px solid ${palette.border}`,
        background: palette.bg,
      }}
    >
      <div style={{ fontWeight: 700, color: palette.color, fontSize: 15 }}>{status.title}</div>
      <div style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 6 }}>{status.desc}</div>
    </div>
  );
}
