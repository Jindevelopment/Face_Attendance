"use client";

import { useState } from "react";
import FaceCapture from "@/components/FaceCapture";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [guardianContact, setGuardianContact] = useState("");
  const [metrics, setMetrics] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | analyzing | saving
  const [result, setResult] = useState(null);
  const [scanKey, setScanKey] = useState(0);

  async function handleSubmit() {
    if (!name.trim()) {
      setResult({ ok: false, message: "이름을 입력해주세요." });
      return;
    }
    if (!metrics) {
      setResult({ ok: false, message: "먼저 얼굴 스캔을 완료해주세요." });
      return;
    }
    // 등록 단계에서도 클라이언트 1차 방어선(라이브니스/합성)이 통과했는지 확인.
    if (!metrics.livenessPassed) {
      setResult({
        ok: false,
        message: "라이브니스 검증에 실패했습니다. 실제 얼굴로 다시 스캔해주세요.",
      });
      return;
    }
    if (metrics.syntheticSuspect) {
      setResult({
        ok: false,
        message: `AI 생성 이미지로 의심됩니다 (score ${metrics.syntheticScore}/100).`,
      });
      return;
    }
    if (!metrics.image) {
      setResult({ ok: false, message: "캡처 이미지가 없습니다. 다시 스캔해주세요." });
      return;
    }

    setSubmitting(true);
    setResult(null);
    setPhase("analyzing");
    try {
      // 1) DeepFace 서버에서 Facenet512 embedding + 라이브니스 최종 판정
      let dfRes;
      try {
        dfRes = await fetch("/api/deepface", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: metrics.image, mode: "register" }),
        });
      } catch (netErr) {
        throw new Error(
          "DeepFace 서버에 연결할 수 없습니다. 네트워크와 서버 상태를 확인해주세요."
        );
      }
      const df = await dfRes.json();
      if (!dfRes.ok) {
        // /api/deepface 는 사용자용 message 를 함께 반환한다 (Part 3a).
        throw new Error(
          df?.message ||
            df?.error ||
            "DeepFace 서버 요청 실패. deepface-api 서버가 실행 중인지 확인해주세요."
        );
      }
      if (df.isReal === false) {
        throw new Error(
          `등록 거부: DeepFace 실물 판별 실패 (score ${
            df.antispoofScore ?? "N/A"
          }). 실제 얼굴로 다시 시도해주세요.`
        );
      }
      if (!Array.isArray(df.embedding) || df.embedding.length === 0) {
        throw new Error("DeepFace 임베딩을 받지 못했습니다.");
      }

      // 2) 임베딩을 저장
      setPhase("saving");
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          guardianContact,
          embedding: df.embedding,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "등록 실패");
      setResult({ ok: true, message: `${name}님이 등록되었습니다.` });
      setName("");
      setGuardianContact("");
      setMetrics(null);
      setScanKey((k) => k + 1);
    } catch (e) {
      setResult({ ok: false, message: e.message });
    } finally {
      setSubmitting(false);
      setPhase("idle");
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>얼굴 등록</h1>
      <p style={{ color: "var(--text-dim)", fontSize: 14, marginTop: 6, marginBottom: 32 }}>
        스캔을 시작하면 <strong>화면에 표시되는 순서대로 고개를 좌우로 살짝 돌려주세요</strong>
        (능동 라이브니스 챌린지, 순서는 매번 랜덤). 지시에 따라 응답한 뒤에야 얼굴 임베딩 캡처가 진행되며,
        등록된 얼굴 특징 벡터(DeepFace Facenet512, 512-d)는 출결 체크 시 매칭 기준으로 사용됩니다.
      </p>

      <div style={{ display: "grid", gap: 14, marginBottom: 28 }}>
        <Field label="이름">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="홍길동"
            style={inputStyle}
          />
        </Field>
        <Field label="보호자/관리자 연락처 (알림용, 선택)">
          <input
            value={guardianContact}
            onChange={(e) => setGuardianContact(e.target.value)}
            placeholder="010-0000-0000"
            style={inputStyle}
          />
        </Field>
      </div>

      <FaceCapture key={scanKey} actionLabel="얼굴 스캔" onCapture={setMetrics} />

      <div style={{ textAlign: "center", marginTop: 24 }}>
        <button
          onClick={handleSubmit}
          disabled={submitting || !metrics}
          style={{
            background: !metrics ? "var(--panel-raised)" : "var(--accent-verify)",
            color: !metrics ? "var(--text-dim)" : "#06231c",
            border: "none",
            padding: "12px 28px",
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 14,
            cursor: metrics ? "pointer" : "default",
          }}
        >
          {phase === "analyzing"
            ? "AI 서버 분석 중..."
            : phase === "saving"
              ? "저장 중..."
              : "등록하기"}
        </button>
      </div>

      {phase === "analyzing" && <ServerAnalyzingBanner />}

      {result && (
        <div
          className="mono"
          style={{
            marginTop: 18,
            textAlign: "center",
            fontSize: 13,
            color: result.ok ? "var(--accent-verify)" : "var(--accent-danger)",
          }}
        >
          {result.message}
        </div>
      )}
    </div>
  );
}

function ServerAnalyzingBanner() {
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
      DeepFace 서버로 이미지 전송 · 임베딩/라이브니스 판정 중 (수 초 소요)
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}

const inputStyle = {
  width: "100%",
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "var(--text)",
  fontSize: 14,
  outline: "none",
};
