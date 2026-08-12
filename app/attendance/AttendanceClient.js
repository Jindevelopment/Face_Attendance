"use client";

import { useState } from "react";
import Link from "next/link";
import FaceCapture from "@/components/FaceCapture";
import { PageHeader, Card, Alert, EmptyState } from "@/components/ui";

// 매칭과 임계값 판정은 서버(/api/match)에서 한다.
// 클라이언트가 임계값을 정하면 요청 조작으로 아무 얼굴이나 통과시킬 수 있기 때문에,
// 이 화면은 embedding 을 보내고 결과만 받는다.

const PHASE_TEXT = {
  client: "실물 여부를 확인하고 있습니다...",
  analyzing: "서버에서 얼굴을 분석하고 있습니다 (몇 초 걸립니다)",
  matching: "등록된 사람과 대조하고 있습니다...",
  saving: "출석을 기록하고 있습니다...",
};

// 다른 화면에서 튕겨 보낸 사유를 사람 말로 옮긴다.
const NOTICE_TEXT = {
  not_admin:
    "관리자 전용 화면이라 이곳으로 옮겨왔습니다. 출결 체크와 내 기록은 그대로 쓰실 수 있습니다.",
};

export default function AttendanceClient({ orgName, totalUsers, notice }) {
  const [status, setStatus] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [phase, setPhase] = useState("idle");
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
          title: "실물로 확인되지 않았습니다",
          desc: "사진이나 화면으로 의심됩니다. 실제 얼굴로 다시 시도해주세요.",
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
          title: "AI로 만든 이미지로 의심됩니다",
          desc: `합성 의심 점수 ${metrics.syntheticScore}/100 — 기준을 넘었습니다.`,
        });
        return;
      }
      if (!metrics.image) {
        setStatus({
          type: "warn",
          title: "화면을 가져오지 못했습니다",
          desc: "카메라 프레임 캡처에 실패했습니다. 다시 시도해주세요.",
        });
        return;
      }

      // === 2단계: 서버 DeepFace (Facenet512 embedding + MiniFASNet 실물 판정) ===
      setPhase("analyzing");
      let dfRes;
      try {
        dfRes = await fetch("/api/deepface", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: metrics.image, mode: "attendance" }),
        });
      } catch {
        setStatus({
          type: "warn",
          title: "서버에 연결하지 못했습니다",
          desc: "얼굴 인식 서버로 요청이 실패했습니다. 잠시 후 다시 시도해주세요.",
        });
        return;
      }
      const df = await dfRes.json();
      if (!dfRes.ok) {
        setStatus({
          type: "warn",
          title:
            df?.error === "deepface_server_down"
              ? "얼굴 인식 서버가 꺼져 있습니다"
              : df?.error === "deepface_timeout"
                ? "서버 응답이 늦습니다"
                : "서버 오류",
          desc: df?.message || df?.error || "관리자에게 문의해주세요.",
        });
        return;
      }

      const deepfaceIsReal = df.isReal;
      const deepfaceAntispoofScore =
        typeof df.antispoofScore === "number" ? Number(df.antispoofScore.toFixed(4)) : null;

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
          title: "실물로 확인되지 않았습니다",
          desc: "서버 판정에서 위조로 분류되었습니다. 실제 얼굴로 다시 시도해주세요.",
        });
        return;
      }

      if (!Array.isArray(df.embedding) || df.embedding.length === 0) {
        setStatus({
          type: "warn",
          title: "얼굴 특징을 추출하지 못했습니다",
          desc: "조명을 밝게 하고 정면을 바라본 뒤 다시 시도해주세요.",
        });
        return;
      }

      // === 3단계: 매칭 (서버, 같은 조직 안에서만) ===
      setPhase("matching");
      const matchRes = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embedding: df.embedding }),
      });
      const match = await matchRes.json();

      if (!matchRes.ok) {
        setStatus({
          type: "warn",
          title: "대조에 실패했습니다",
          desc: match?.message || "서버에서 얼굴 대조에 실패했습니다.",
        });
        return;
      }

      if (match.reason === "no_users") {
        setStatus({
          type: "warn",
          title: "등록된 사람이 없습니다",
          desc: "먼저 얼굴을 등록해주세요.",
        });
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
          type: "warn",
          title: "등록된 얼굴과 맞지 않습니다",
          desc: `${orgName} 에 등록된 사람 중 일치하는 얼굴이 없습니다. 얼굴 등록을 먼저 해주세요.`,
        });
        return;
      }

      // === 4단계: 출결 기록 ===
      setPhase("saving");
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
        setStatus({
          type: "warn",
          title: "출석을 기록하지 못했습니다",
          desc: attData?.message || "서버가 기록을 거부했습니다.",
        });
        return;
      }

      if (attData.status === "DUPLICATE") {
        setStatus({
          type: "duplicate",
          title: `${match.name}님, 이미 출석했습니다`,
          desc: "5분 이내에 이미 기록되어 있습니다.",
        });
      } else {
        setStatus({
          type: "success",
          title: `${match.name}님, 출석했습니다`,
          desc: `얼굴 거리 ${match.distance} · 실물 판정 통과`,
        });
      }
    } catch (e) {
      setStatus({ type: "warn", title: "오류가 발생했습니다", desc: e.message });
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
  }) {
    await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        livenessPassed: metrics.livenessPassed,
        blinkDetected: metrics.blinkDetected,
        jitterScore: metrics.jitterScore,
        syntheticScore: metrics.syntheticScore,
        matchDistance: null,
        deepfaceIsReal,
        deepfaceAntispoofScore,
        challengeSequence: metrics.challengeSequence,
        result,
        reason,
      }),
    });
  }

  return (
    <div className="page-mid">
      <PageHeader title="출결 체크" desc={orgName} />

      {notice && NOTICE_TEXT[notice] && (
        <div style={{ marginTop: 20 }}>
          <Alert type="info">{NOTICE_TEXT[notice]}</Alert>
        </div>
      )}

      {totalUsers === 0 ? (
        <div className="section">
          <EmptyState
            title="아직 등록된 얼굴이 없습니다"
            action={
              <Link href="/me" className="btn btn-primary">
                내 얼굴 등록하기
              </Link>
            }
          >
            출결 체크를 하려면 먼저 얼굴을 한 번 등록해야 합니다.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="section">
            <Alert type="plain">
              <span>
                스캔을 누르면 <strong>화면이 알려주는 방향으로 고개를 돌려주세요.</strong> 순서는
                매번 바뀝니다. 사진이나 화면으로는 통과할 수 없습니다.
              </span>
            </Alert>
          </div>

          <FaceCapture
            key={scanKey}
            actionLabel={processing ? "처리 중..." : "출결 스캔"}
            onCapture={handleCapture}
          />

          {phase !== "idle" && (
            <div style={{ marginTop: 16 }}>
              <Alert type="info">{PHASE_TEXT[phase]}</Alert>
            </div>
          )}

          {status && (
            <div style={{ marginTop: 18 }}>
              <ResultCard status={status} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ResultCard({ status }) {
  const tone = {
    success: { color: "var(--brand)", bg: "var(--brand-soft)", border: "var(--brand)" },
    spoof: { color: "var(--danger)", bg: "var(--danger-soft)", border: "var(--danger)" },
    warn: { color: "var(--warn)", bg: "var(--warn-soft)", border: "var(--warn)" },
    duplicate: { color: "var(--warn)", bg: "var(--warn-soft)", border: "var(--warn)" },
  }[status.type];

  return (
    <Card style={{ background: tone.bg, borderColor: tone.border }}>
      <div style={{ fontWeight: 800, color: tone.color, fontSize: 18, letterSpacing: "-0.02em" }}>
        {status.title}
      </div>
      <div style={{ color: "var(--text-dim)", fontSize: 13.5, marginTop: 7, lineHeight: 1.6 }}>
        {status.desc}
      </div>
    </Card>
  );
}
