// 로그인/회원가입 화면이 공유하는 표현 요소.
// 앱의 나머지 화면과 마찬가지로 인라인 스타일 + CSS 변수를 쓴다.

import Link from "next/link";

export function AuthCard({ title, desc, children }) {
  return (
    <div style={{ maxWidth: 420, margin: "0 auto", padding: "64px 24px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>{title}</h1>
      {desc && (
        <p style={{ color: "var(--text-dim)", fontSize: 13.5, marginTop: 8, marginBottom: 28, lineHeight: 1.6 }}>
          {desc}
        </p>
      )}
      <div className="panel" style={{ padding: 22, borderRadius: 10 }}>
        {children}
      </div>
      <p style={{ marginTop: 20, fontSize: 12.5, color: "var(--text-dim)" }}>
        <Link href="/attendance" style={{ color: "var(--text-dim)" }}>
          ← 출결 체크로 돌아가기
        </Link>
      </p>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <span
        className="mono"
        style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)", marginBottom: 6, letterSpacing: "0.04em" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

export function SubmitButton({ disabled, children }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      style={{
        width: "100%",
        padding: "11px 16px",
        borderRadius: 8,
        border: "none",
        background: disabled ? "var(--border)" : "var(--accent-verify)",
        color: disabled ? "var(--text-dim)" : "#04211a",
        fontWeight: 800,
        fontSize: 14,
        cursor: disabled ? "default" : "pointer",
        marginTop: 4,
      }}
    >
      {children}
    </button>
  );
}

export function Notice({ type = "info", children }) {
  const palette = {
    error: { border: "var(--accent-danger)", color: "var(--accent-danger)", bg: "rgba(255,86,86,0.08)" },
    success: { border: "var(--accent-verify)", color: "var(--accent-verify)", bg: "rgba(52,216,176,0.08)" },
    info: { border: "var(--border)", color: "var(--text-dim)", bg: "var(--panel)" },
  }[type];

  return (
    <div
      style={{
        margin: "4px 0 14px",
        padding: "10px 12px",
        borderRadius: 8,
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        color: palette.color,
        fontSize: 12.5,
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  );
}
