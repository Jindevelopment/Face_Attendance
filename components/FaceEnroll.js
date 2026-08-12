"use client";

import { useState } from "react";
import FaceCapture from "@/components/FaceCapture";
import { Alert, Button } from "@/components/ui";

// 얼굴 등록 절차.
//
// 관리자가 남을 등록할 때(/admin/members)와 본인이 등록할 때(/me)의 절차가 같아서
// 한곳에 모았다. 차이는 self 플래그와 보여줄 입력칸뿐이다.
//
// props:
//   self         true 면 본인 등록 (서버가 계정과 연결하고 중복 등록을 막는다)
//   fixedName    본인 등록처럼 이름이 이미 정해진 경우
//   onDone       등록 성공 후 호출 (목록 새로고침 등)

export default function FaceEnroll({ self = false, fixedName, onDone }) {
  const [name, setName] = useState(fixedName ?? "");
  const [guardianContact, setGuardianContact] = useState("");
  const [metrics, setMetrics] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | analyzing | saving
  const [result, setResult] = useState(null);
  const [scanKey, setScanKey] = useState(0);

  const busy = phase !== "idle";

  async function handleSubmit() {
    if (!name.trim()) {
      setResult({ ok: false, message: "이름을 입력해주세요." });
      return;
    }
    if (!metrics) {
      setResult({ ok: false, message: "먼저 얼굴 스캔을 완료해주세요." });
      return;
    }
    // 등록 단계에서도 클라이언트 1차 방어선(라이브니스/합성)이 통과했는지 확인한다.
    // 여기가 뚫리면 위조된 얼굴이 아예 기준 벡터로 등록되어, 이후 모든 판정이 무의미해진다.
    if (!metrics.livenessPassed) {
      setResult({ ok: false, message: "실물 판별에 실패했습니다. 실제 얼굴로 다시 스캔해주세요." });
      return;
    }
    if (metrics.syntheticSuspect) {
      setResult({
        ok: false,
        message: `AI로 만든 이미지로 의심됩니다 (점수 ${metrics.syntheticScore}/100).`,
      });
      return;
    }
    if (!metrics.image) {
      setResult({ ok: false, message: "캡처된 이미지가 없습니다. 다시 스캔해주세요." });
      return;
    }

    setResult(null);
    setPhase("analyzing");
    try {
      // 1) DeepFace 서버에서 Facenet512 임베딩 + 실물 최종 판정
      let dfRes;
      try {
        dfRes = await fetch("/api/deepface", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: metrics.image, mode: "register" }),
        });
      } catch {
        throw new Error("얼굴 인식 서버에 연결할 수 없습니다. 서버가 켜져 있는지 확인해주세요.");
      }
      const df = await dfRes.json();
      if (!dfRes.ok) {
        throw new Error(
          df?.message || df?.error || "얼굴 인식 서버 요청에 실패했습니다."
        );
      }
      if (df.isReal === false) {
        throw new Error(
          `등록이 거부되었습니다. 실물로 판정되지 않았습니다 (점수 ${df.antispoofScore ?? "N/A"}).`
        );
      }
      if (!Array.isArray(df.embedding) || df.embedding.length === 0) {
        throw new Error("얼굴 특징을 추출하지 못했습니다. 조명을 밝게 하고 다시 시도해주세요.");
      }

      // 2) 저장
      setPhase("saving");
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          guardianContact,
          embedding: df.embedding,
          self,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "등록에 실패했습니다.");

      setResult({ ok: true, message: `${name.trim()}님이 등록되었습니다.` });
      if (!fixedName) setName("");
      setGuardianContact("");
      setMetrics(null);
      setScanKey((k) => k + 1);
      onDone?.();
    } catch (e) {
      setResult({ ok: false, message: e.message });
    } finally {
      setPhase("idle");
    }
  }

  return (
    <div>
      {!fixedName && (
        <>
          <label className="field">
            <span className="field-label">이름</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
            />
          </label>
          <label className="field">
            <span className="field-label">보호자 연락처 (선택)</span>
            <input
              className="input"
              value={guardianContact}
              onChange={(e) => setGuardianContact(e.target.value)}
              placeholder="010-0000-0000"
            />
          </label>
        </>
      )}

      <FaceCapture key={scanKey} actionLabel="얼굴 스캔" onCapture={setMetrics} />

      {metrics && (
        <div style={{ marginTop: 14 }}>
          <Alert type="success">
            스캔이 끝났습니다. 아래 <strong>등록하기</strong>를 누르면 저장됩니다.
          </Alert>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <Button onClick={handleSubmit} disabled={busy || !metrics} block size="lg">
          {phase === "analyzing"
            ? "얼굴 분석 중..."
            : phase === "saving"
              ? "저장 중..."
              : "등록하기"}
        </Button>
      </div>

      {phase === "analyzing" && (
        <p style={{ marginTop: 12, textAlign: "center", fontSize: 12.5, color: "var(--text-faint)" }}>
          서버에서 실물 판정과 얼굴 특징 추출을 하고 있습니다 (몇 초 걸립니다)
        </p>
      )}

      {result && (
        <div style={{ marginTop: 14 }}>
          <Alert type={result.ok ? "success" : "error"}>{result.message}</Alert>
        </div>
      )}
    </div>
  );
}
