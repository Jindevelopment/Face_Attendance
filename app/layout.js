import "./globals.css";
import Link from "next/link";
import { cookies } from "next/headers";
import { getAuthState } from "@/lib/supabaseAuth";

export const metadata = {
  title: "FaceGate — 위조 판별 출결 시스템",
  description: "얼굴 인식 + AI 생성 이미지 판별 기반 출결 관리 MVP",
};

export default async function RootLayout({ children }) {
  // 로그인 상태에 따라 헤더 메뉴를 다르게 보여준다.
  // 실제 접근 차단은 proxy.js 와 각 페이지의 requireAdminPage() 가 담당한다.
  // 메뉴를 감추는 것은 편의일 뿐 보안 장치가 아니다.
  let isAdmin = false;
  let isLoggedIn = false;
  let email = null;
  try {
    const state = await getAuthState(await cookies());
    isAdmin = state.isAdmin;
    isLoggedIn = Boolean(state.user);
    email = state.user?.email ?? null;
  } catch {
    // Supabase 환경변수가 없는 상태에서도 앱이 뜨긴 해야 한다.
  }

  return (
    <html lang="ko">
      <body>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
          <NavBar isAdmin={isAdmin} isLoggedIn={isLoggedIn} email={email} />
          <main style={{ flex: 1 }}>{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}

function NavBar({ isAdmin, isLoggedIn, email }) {
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
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
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
        </Link>
        <nav style={{ display: "flex", gap: 22, alignItems: "center" }}>
          <NavLink href="/attendance">출결 체크</NavLink>
          {isAdmin && <NavLink href="/register">얼굴 등록</NavLink>}
          {isAdmin && <NavLink href="/dashboard">대시보드</NavLink>}
          {/* 로그아웃은 "로그인했는가" 기준으로 띄운다. 관리자 기준으로 두면
              권한 없는 계정으로 로그인한 사람이 로그아웃할 방법이 없어진다. */}
          {isLoggedIn ? (
            <form action="/logout" method="post" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="mono" style={{ color: "var(--text-dim)", fontSize: 11 }}>{email}</span>
              <button
                type="submit"
                style={{
                  background: "none",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  color: "var(--text-dim)",
                  fontSize: 12,
                  padding: "4px 10px",
                  cursor: "pointer",
                }}
              >
                로그아웃
              </button>
            </form>
          ) : (
            <NavLink href="/login">로그인</NavLink>
          )}
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
