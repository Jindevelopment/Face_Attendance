"use client";

import { useState } from "react";
import FaceCapture from "@/components/FaceCapture";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [guardianContact, setGuardianContact] = useState("");
  const [metrics, setMetrics] = useState(null);
  const [submitting, setSubmitting] = useState(false);
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
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          guardianContact,
          descriptor: metrics.descriptor,
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
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>얼굴 등록</h1>
      <p style={{ color: "var(--text-dim)", fontSize: 14, marginTop: 6, marginBottom: 32 }}>
        정면을 응시한 상태로 스캔해주세요. 등록된 얼굴 특징 벡터는 출결 체크 시 매칭 기준으로 사용됩니다.
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
          {submitting ? "등록 중..." : "등록하기"}
        </button>
      </div>

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
