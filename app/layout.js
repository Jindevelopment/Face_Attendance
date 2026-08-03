import "./globals.css";

export const metadata = {
  title: "FaceGate — 위조 판별 출결 시스템",
  description: "얼굴 인식 + AI 생성 이미지 판별 기반 출결 관리 MVP",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
          <NavBar />
          <main style={{ flex: 1 }}>{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}

function NavBar() {
  return (
    <header
      style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--panel)",
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <span
            className="status-dot"
            style={{ background: "var(--accent-verify)", boxShadow: "0 0 8px var(--accent-verify)" }}
          />
          <span style={{ color: "var(--text)", fontWeight: 700, letterSpacing: "-0.02em", fontSize: 17 }}>
            FaceGate
          </span>
          <span className="mono" style={{ color: "var(--text-dim)", fontSize: 11 }}>
            v0.1 · anti-spoof
          </span>
        </a>
        <nav style={{ display: "flex", gap: 22 }}>
          <NavLink href="/register">얼굴 등록</NavLink>
          <NavLink href="/attendance">출결 체크</NavLink>
          <NavLink href="/dashboard">대시보드</NavLink>
        </nav>
      </div>
    </header>
  );
}

function NavLink({ href, children }) {
  return (
    <a
      href={href}
      style={{
        color: "var(--text-dim)",
        textDecoration: "none",
        fontSize: 14,
        fontWeight: 500,
      }}
    >
      {children}
    </a>
  );
}

function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--border)", padding: "18px 24px" }}>
      <div
        className="mono"
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          color: "var(--text-dim)",
          fontSize: 11,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>FaceGate MVP — 데모/개발용 (프로덕션 배포 전 보안·개인정보 검토 필요)</span>
        <span>face-api.js · liveness heuristic · synthetic-image heuristic</span>
      </div>
    </footer>
  );
}
