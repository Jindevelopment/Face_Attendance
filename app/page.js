export default function Home() {
  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "64px 24px" }}>
      <div style={{ display: "flex", gap: 48, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 420px", minWidth: 320 }}>
          <div className="mono" style={{ color: "var(--accent-verify)", fontSize: 12, marginBottom: 14, letterSpacing: "0.08em" }}>
            01 · LIVENESS &nbsp;&nbsp;02 · SYNTHETIC CHECK &nbsp;&nbsp;03 · MATCH
          </div>
          <h1 style={{ fontSize: 42, lineHeight: 1.15, fontWeight: 800, letterSpacing: "-0.03em", margin: 0 }}>
            출석하는 사람이<br />
            <span style={{ color: "var(--accent-verify)" }}>진짜 그 사람</span>인지부터
            확인합니다.
          </h1>
          <p style={{ color: "var(--text-dim)", fontSize: 16, lineHeight: 1.7, marginTop: 20 }}>
            사진 재생, 화면 재생, AI로 합성된 얼굴 이미지까지 — 얼굴을 매칭하기 전에
            먼저 &quot;살아있는 실물 얼굴인가&quot;를 판별합니다. 판별을 통과한 경우에만
            출결이 기록됩니다.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
            <a href="/register" style={btnPrimary}>
              얼굴 등록하기
            </a>
            <a href="/attendance" style={btnGhost}>
              출결 체크 →
            </a>
          </div>
        </div>

        <div className="scan-frame panel" style={{ flex: "1 1 320px", minWidth: 280, aspectRatio: "4/5", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <div className="corner-tl" />
          <div className="corner-tr" />
          <div className="corner-bl" />
          <div className="corner-br" />
          <div style={{ textAlign: "center", color: "var(--text-dim)" }}>
            <div className="mono" style={{ fontSize: 12, marginBottom: 8 }}>CAMERA PREVIEW</div>
            <div style={{ fontSize: 13 }}>얼굴 등록 / 출결 체크 페이지에서<br />실시간으로 표시됩니다</div>
          </div>
          <ScanLine />
        </div>
      </div>

      <div style={{ marginTop: 80, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <StepCard n="01" title="라이브니스 판별" desc="눈 깜빡임, 미세 움직임을 프레임 시퀀스로 분석해 사진·화면 재생을 차단합니다." />
        <StepCard n="02" title="AI 생성 이미지 판별" desc="주파수·텍스처 특성을 분석해 딥페이크/합성 얼굴 의심 여부를 점수화합니다." />
        <StepCard n="03" title="얼굴 매칭 & 기록" desc="판별을 통과한 경우에만 등록 DB와 대조해 출결을 기록하고 알림을 발송합니다." />
      </div>
    </div>
  );
}

function StepCard({ n, title, desc }) {
  return (
    <div className="panel" style={{ padding: 22 }}>
      <div className="mono" style={{ color: "var(--accent-verify)", fontSize: 12, marginBottom: 10 }}>{n}</div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{title}</div>
      <div style={{ color: "var(--text-dim)", fontSize: 13.5, lineHeight: 1.6 }}>{desc}</div>
    </div>
  );
}

function ScanLine() {
  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        height: 2,
        background: "linear-gradient(90deg, transparent, var(--accent-verify), transparent)",
        top: "50%",
        opacity: 0.6,
      }}
    />
  );
}

const btnPrimary = {
  background: "var(--accent-verify)",
  color: "#06231c",
  padding: "12px 20px",
  borderRadius: 8,
  fontWeight: 700,
  fontSize: 14,
  textDecoration: "none",
};

const btnGhost = {
  border: "1px solid var(--border)",
  color: "var(--text)",
  padding: "12px 20px",
  borderRadius: 8,
  fontWeight: 600,
  fontSize: 14,
  textDecoration: "none",
};
