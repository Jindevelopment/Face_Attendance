"use client";

import { useState } from "react";
import FaceCapture from "@/components/FaceCapture";

// 매칭과 임계값 판정은 서버(/api/match)에서 한다.
// 클라이언트가 임계값을 정하면 요청 조작으로 아무 얼굴이나 통과시킬 수 있기 때문에,
// 이 페이지는 embedding 을 보내고 결과만 받는다.

export default function AttendancePage() {
  const [status, setStatus] = useState(null); // { type: 'success'|'spoof'|'no_match'|'duplicate', ... }
  const [processing, setProcessing] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | client | analyzing | matching
  const [scanKey, setScanKey] = useState(0);

  async function handleCapture(metrics) {
    setProcessing(true);
    setStatus(null);
    setPhase("client");
    try {
      // === 1단계: 클라이언트 1차 방어선 (경량 휴리스틱) ===
      if (!metrics.livenessPassed) {
        await logResult({
          result: "REJECTED_SPOOF",
          reason: "클라이언트 라이브니스 실패 (사진/화면 재생 의심)",
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
      if (!metrics.image) {
        setStatus({
          type: "no_match",
          title: "캡처 실패",
          desc: "카메라 프레임을 가져오지 못했습니다. 다시 시도해주세요.",
        });
        return;
      }

      // === 2단계: 서버 DeepFace (Facenet512 embedding + MiniFASNet 라이브니스) ===
      setPhase("analyzing");
      let dfRes;
      try {
        dfRes = await fetch("/api/deepface", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: metrics.image, mode: "attendance" }),
        });
      } catch (netErr) {
        setStatus({
          type: "no_match",
          title: "네트워크 오류",
          desc: "DeepFace 프록시로의 요청이 실패했습니다. 잠시 후 다시 시도해주세요.",
        });
        return;
      }
      const df = await dfRes.json();
      if (!dfRes.ok) {
        // /api/deepface 는 message 필드로 사용자용 안내 문구를 제공한다.
        setStatus({
          type: "no_match",
          title:
            df?.error === "deepface_server_down"
              ? "DeepFace 서버 꺼짐"
              : df?.error === "deepface_timeout"
                ? "DeepFace 서버 응답 지연"
                : "DeepFace 서버 오류",
          desc:
            df?.message ||
            df?.error ||
            "서버 응답 실패. deepface-api 프로세스가 5005 포트에서 실행 중인지 확인하세요.",
        });
        return;
      }

      const deepfaceIsReal = df.isReal;
      const deepfaceAntispoofScore =
        typeof df.antispoofScore === "number"
          ? Number(df.antispoofScore.toFixed(4))
          : null;

      if (deepfaceIsReal === false) {
        await logResult({
          result: "REJECTED_SPOOF",
          reason: `DeepFace 라이브니스 실패 (antispoof ${deepfaceAntispoofScore ?? "N/A"})`,
          metrics,
          deepfaceIsReal,
          deepfaceAntispoofScore,
        });
        setStatus({
          type: "spoof",
          title: "서버 실물 판별 실패",
          desc: `DeepFace(MiniFASNet) 위조 판정 · antispoof score ${
            deepfaceAntispoofScore ?? "N/A"
          }`,
        });
        return;
      }

      if (!Array.isArray(df.embedding) || df.embedding.length === 0) {
        setStatus({
          type: "no_match",
          title: "임베딩 실패",
          desc: "DeepFace 가 얼굴 임베딩을 반환하지 않았습니다.",
        });
        return;
      }

      // === 3단계: 매칭 (서버) ===
      // 이전에는 /api/users 로 등록자 전원의 embedding 을 받아 브라우저에서 비교했다.
      // 그 방식은 이 페이지를 여는 누구에게나 타인의 생체정보를 넘겨준다.
      // 이제 embedding 하나를 보내고 결과만 받는다 (매칭은 pgvector 가 수행).
      setPhase("matching");
      const matchRes = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embedding: df.embedding }),
      });
      const match = await matchRes.json();

      if (!matchRes.ok) {
        setStatus({
          type: "no_match",
          title: "매칭 실패",
          desc: match?.message || "서버에서 얼굴 매칭에 실패했습니다.",
        });
        return;
      }

      if (match.reason === "no_users") {
        setStatus({ type: "no_match", title: "등록된 사용자 없음", desc: "먼저 얼굴을 등록해주세요." });
        return;
      }

      if (!match.matched) {
        await logResult({
          result: "REJECTED_NO_MATCH",
          reason: `매칭 실패 (임계값 ${match.threshold} 이내 없음, 등록자 ${match.totalUsers}명)`,
          metrics,
          deepfaceIsReal,
          deepfaceAntispoofScore,
        });
        setStatus({
          type: "no_match",
          title: "일치하는 사용자 없음",
          desc: "등록된 얼굴과 일치하지 않습니다.",
        });
        return;
      }

      // === 4단계: 출결 기록 ===
      const matchDistance = match.distance;
      const attRes = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // 사용자 정보는 보내지 않는다. 서버가 서명한 증표만 돌려주면,
          // 서버가 그 안에서 userId·name·거리를 꺼낸다.
          matchToken: match.matchToken,
          livenessPassed: metrics.livenessPassed,
          blinkDetected: metrics.blinkDetected,
          jitterScore: metrics.jitterScore,
          syntheticScore: metrics.syntheticScore,
          deepfaceIsReal,
          deepfaceAntispoofScore,
          challengeSequence: metrics.challengeSequence,
          result: "SUCCESS",
        }),
      });
      const attData = await attRes.json();

      if (!attRes.ok) {
        // 증표가 만료됐거나(스캔 후 2분 초과) 서버에 서명 키가 없는 경우.
        setStatus({
          type: "no_match",
          title: "출결 기록 실패",
          desc: attData?.message || "서버가 출결 기록을 거부했습니다.",
        });
        return;
      }

      if (attData.status === "DUPLICATE") {
        setStatus({
          type: "duplicate",
          title: `${match.name}님`,
          desc: "이미 최근에 출결이 기록되었습니다 (5분 이내 중복 방지).",
        });
      } else {
        setStatus({
          type: "success",
          title: `${match.name}님 출석 완료`,
          desc: `cos 거리 ${matchDistance} · DeepFace 실물 판정 · antispoof ${
            deepfaceAntispoofScore ?? "N/A"
          }`,
        });
      }
    } catch (e) {
      setStatus({ type: "no_match", title: "오류 발생", desc: e.message });
    } finally {
      setProcessing(false);
      setPhase("idle");
      setScanKey((k) => k + 1);
    }
  }

  async function logResult({
    result,
    reason,
    metrics,
    deepfaceIsReal = null,
    deepfaceAntispoofScore = null,
    matchDistance = null,
  }) {
    await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        livenessPassed: metrics.livenessPassed,
        blinkDetected: metrics.blinkDetected,
        jitterScore: metrics.jitterScore,
        syntheticScore: metrics.syntheticScore,
        matchDistance,
        deepfaceIsReal,
        deepfaceAntispoofScore,
        challengeSequence: metrics.challengeSequence,
        result,
        reason,
      }),
    });
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>출결 체크</h1>
      <p style={{ color: "var(--text-dim)", fontSize: 14, marginTop: 6, marginBottom: 32 }}>
        스캔 버튼을 누르면 <strong>화면에 표시되는 순서대로 고개를 좌우로 살짝 돌려주세요</strong>
        (순서는 매번 랜덤). 능동 챌린지 통과 → 클라이언트 1차 검증(눈깜빡임/합성 휴리스틱) →
        DeepFace 서버 2차 검증(라이브니스 + Facenet512 매칭)을 모두 통과한 경우에만 출결이 기록됩니다.
      </p>

      <FaceCapture key={scanKey} actionLabel={processing ? "처리 중..." : "출결 스캔"} onCapture={handleCapture} />

      {phase !== "idle" && <PhaseBanner phase={phase} />}
      {status && <StatusPanel status={status} />}
    </div>
  );
}

function PhaseBanner({ phase }) {
  const text = {
    client: "클라이언트 라이브니스/합성 판정 중...",
    analyzing: "DeepFace 서버 분석 중 (임베딩 + MiniFASNet 라이브니스, 수 초 소요)",
    matching: "등록 사용자와 매칭 중...",
  }[phase];
  if (!text) return null;
  return (
    <div
      className="mono"
      style={{
        marginTop: 18,
        padding: 12,
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--panel)",
        color: "var(--text-dim)",
        fontSize: 12.5,
        textAlign: "center",
      }}
    >
      {text}
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
