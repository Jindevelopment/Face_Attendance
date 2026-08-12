import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAuthState } from "@/lib/supabaseAuth";

// 첫 화면은 "나는 어느 쪽인가" 를 고르는 자리다.
//
// 이전 랜딩은 기술 소개만 하고 /register 와 /attendance 로 보냈는데, 처음 온 사람은
// 자기가 관리자인지 참여자인지부터 갈라야 한다. 그걸 안 물어보니 아무 데나 눌렀다가
// 권한 없음 화면을 만났다.
//
// 이미 로그인했고 소속이 있으면 여기 머무를 이유가 없으므로 바로 보낸다.
export default async function Home() {
  let state = { user: null, activeOrg: null, isAdmin: false, memberships: [] };
  try {
    state = await getAuthState(await cookies());
  } catch {
    // 환경변수 미설정 상태. 아래 안내 화면을 그대로 보여준다.
  }

  if (state.user) {
    if (state.memberships.length === 0) redirect("/start");
    redirect(state.isAdmin ? "/admin/dashboard" : "/attendance");
  }

  return (
    <div className="page">
      <section style={{ padding: "36px 0 8px", maxWidth: 620 }}>
        <div
          className="mono"
          style={{ color: "var(--brand)", fontSize: 12, letterSpacing: "0.1em", marginBottom: 14 }}
        >
          얼굴 인식 출결 관리
        </div>
        <h1 style={{ fontSize: 40, lineHeight: 1.2, fontWeight: 800, letterSpacing: "-0.035em", margin: 0 }}>
          출석하는 사람이
          <br />
          <span style={{ color: "var(--brand)" }}>진짜 그 사람</span>인지부터 확인합니다.
        </h1>
        <p style={{ color: "var(--text-dim)", fontSize: 16, lineHeight: 1.7, marginTop: 18 }}>
          인쇄한 사진, 폰 화면에 띄운 얼굴, AI로 만든 얼굴 — 누구인지 찾기 전에
          &ldquo;살아있는 실물인가&rdquo;부터 봅니다. 통과한 경우에만 출결이 기록됩니다.
        </p>
      </section>

      <section className="section" style={{ marginTop: 44 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          <Link href="/admin/signup" className="card card-link card-pad-lg">
            <Badge>관리자</Badge>
            <h2 style={{ fontSize: 19, fontWeight: 800, margin: "14px 0 8px", letterSpacing: "-0.02em" }}>
              조직 만들기
            </h2>
            <p style={{ color: "var(--text-dim)", fontSize: 14, lineHeight: 1.65, margin: 0 }}>
              학교·학원·회사 단위로 출결을 관리합니다. 만들면 <strong style={{ color: "var(--text)" }}>인증코드</strong>가
              나오고, 그 코드를 받은 사람만 참여할 수 있습니다.
            </p>
            <div style={{ marginTop: 18, color: "var(--brand)", fontWeight: 700, fontSize: 14 }}>
              시작하기 →
            </div>
          </Link>

          <Link href="/join" className="card card-link card-pad-lg">
            <Badge>참여자</Badge>
            <h2 style={{ fontSize: 19, fontWeight: 800, margin: "14px 0 8px", letterSpacing: "-0.02em" }}>
              인증코드로 참여
            </h2>
            <p style={{ color: "var(--text-dim)", fontSize: 14, lineHeight: 1.65, margin: 0 }}>
              관리자에게 받은 8자리 코드를 입력하면 그 조직의 출결 화면으로 들어갑니다.
              얼굴을 한 번 등록하면 그다음부터는 카메라 앞에 서기만 하면 됩니다.
            </p>
            <div style={{ marginTop: 18, color: "var(--brand)", fontWeight: 700, fontSize: 14 }}>
              코드 입력 →
            </div>
          </Link>
        </div>

        <p style={{ marginTop: 18, fontSize: 13, color: "var(--text-faint)" }}>
          이미 계정이 있으신가요?{" "}
          <Link href="/login" style={{ color: "var(--brand)" }}>
            로그인
          </Link>
        </p>
      </section>

      <section className="section" style={{ marginTop: 56 }}>
        <h2 className="section-title" style={{ color: "var(--text-dim)" }}>
          출결 한 번에 거치는 관문
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <Step n="01" title="고개 돌리기" desc="화면이 지시하는 방향으로 고개를 돌립니다. 순서는 매번 바뀌고, 사진은 고개를 돌릴 수 없습니다." />
          <Step n="02" title="실물 판별" desc="AI 모델이 인쇄 사진·화면 재생·합성 이미지인지 판정합니다." />
          <Step n="03" title="얼굴 대조" desc="같은 조직에 등록된 사람과만 대조합니다. 통과해야 기록됩니다." />
        </div>
      </section>
    </div>
  );
}

function Badge({ children }) {
  return <span className="badge badge-brand">{children}</span>;
}

function Step({ n, title, desc }) {
  return (
    <div className="card">
      <div className="mono" style={{ color: "var(--brand)", fontSize: 12, marginBottom: 10 }}>
        {n}
      </div>
      <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 7 }}>{title}</div>
      <div style={{ color: "var(--text-dim)", fontSize: 13.5, lineHeight: 1.6 }}>{desc}</div>
    </div>
  );
}
