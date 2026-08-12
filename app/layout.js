import "./globals.css";
import Link from "next/link";
import { cookies } from "next/headers";
import { getAuthState } from "@/lib/supabaseAuth";

export const metadata = {
  title: "FaceGate — 얼굴 인식 출결 관리",
  description: "위조 판별을 거친 얼굴 인식으로 출결을 기록합니다.",
};

export default async function RootLayout({ children }) {
  // 헤더 메뉴를 역할에 맞게 보여준다.
  // 실제 접근 차단은 proxy.js 와 각 화면의 가드(lib/guards.js)가 담당한다.
  // 메뉴를 감추는 것은 편의일 뿐 보안 장치가 아니다.
  let state = { user: null, activeOrg: null, isAdmin: false, memberships: [] };
  try {
    state = await getAuthState(await cookies());
  } catch {
    // Supabase 환경변수가 없어도 앱이 뜨긴 해야 한다 (설정 안내를 보여줘야 하므로).
  }

  return (
    <html lang="ko">
      <body>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
          <NavBar state={state} />
          <main style={{ flex: 1 }}>{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}

function NavBar({ state }) {
  const { user, activeOrg, isAdmin } = state;
  const loggedIn = Boolean(user);

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link href="/" className="nav-brand">
          <span
            className="status-dot"
            style={{ background: "var(--brand)", boxShadow: "0 0 8px var(--brand)" }}
          />
          FaceGate
        </Link>

        <nav className="nav-links">
          {loggedIn && activeOrg && (
            <>
              <Link className="nav-link" href="/attendance">
                출결 체크
              </Link>
              {isAdmin ? (
                <>
                  <Link className="nav-link" href="/admin/dashboard">
                    대시보드
                  </Link>
                  <Link className="nav-link" href="/admin/members">
                    등록 관리
                  </Link>
                  <Link className="nav-link" href="/admin/settings">
                    인증코드
                  </Link>
                </>
              ) : (
                <Link className="nav-link" href="/me">
                  내 기록
                </Link>
              )}
            </>
          )}

          {loggedIn ? (
            <form action="/logout" method="post" className="row" style={{ gap: 8 }}>
              <span
                className="mono"
                style={{ color: "var(--text-faint)", fontSize: 11.5 }}
                title={user.email}
              >
                {activeOrg ? activeOrg.orgName : user.email}
              </span>
              <button type="submit" className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5 }}>
                로그아웃
              </button>
            </form>
          ) : (
            <>
              <Link className="nav-link" href="/login">
                로그인
              </Link>
              <Link
                className="btn btn-primary"
                href="/join"
                style={{ padding: "8px 14px", fontSize: 13 }}
              >
                회원가입
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <span>FaceGate — 데모/개발용. 실서비스 전 보안·개인정보 검토가 필요합니다.</span>
        <span className="mono">DeepFace · Facenet512 · MiniFASNet</span>
      </div>
    </footer>
  );
}
