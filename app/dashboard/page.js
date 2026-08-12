import { getUsers, getAttendanceLogs, getAntiSpoofLogs, isLegacyUser } from "@/lib/db";
import { requireAdminPage } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

// lib/db.js 가 Supabase 기반으로 바뀌면서 조회가 전부 async 가 됐다.
export default async function DashboardPage() {
  // 데이터를 조회하기 전에 인가를 확인한다.
  await requireAdminPage("/dashboard");

  const [users, attendanceLogs, antiSpoofLogs] = await Promise.all([
    getUsers(),
    getAttendanceLogs(),
    getAntiSpoofLogs(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  // occurred_at 은 timestamptz 라 ISO 문자열로 내려오지만, 안전하게 Date 로 정규화한다.
  const isToday = (l) => new Date(l.timestamp).toISOString().slice(0, 10) === today;
  const todayCount = attendanceLogs.filter(isToday).length;
  const spoofToday = antiSpoofLogs.filter(isToday).length;
  const legacyCount = users.filter(isLegacyUser).length;

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>관리자 대시보드</h1>
      <p style={{ color: "var(--text-dim)", fontSize: 14, marginTop: 6, marginBottom: 32 }}>
        출결 현황과 위조 판별 이상 탐지 로그를 확인합니다.
      </p>

      {legacyCount > 0 && (
        <div
          style={{
            marginBottom: 24,
            padding: 14,
            borderRadius: 8,
            border: "1px solid var(--accent-warn)",
            background: "rgba(245,166,35,0.08)",
            color: "var(--accent-warn)",
            fontSize: 13,
          }}
        >
          <strong>재등록 필요:</strong> 구버전(face-api.js 128-d) 스키마로 저장된 사용자
          <strong> {legacyCount}명</strong> 이 매칭 대상에서 제외되어 있습니다.
          DeepFace(Facenet512 512-d) 로 재등록해주세요.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 36 }}>
        <StatCard label="등록 사용자" value={users.length} />
        <StatCard
          label="재등록 필요 (레거시)"
          value={legacyCount}
          accent={legacyCount > 0 ? "var(--accent-warn)" : "var(--text)"}
        />
        <StatCard label="오늘 출결" value={todayCount} accent="var(--accent-verify)" />
        <StatCard label="오늘 위조 탐지" value={spoofToday} accent="var(--accent-danger)" />
        <StatCard label="누적 이상 탐지" value={antiSpoofLogs.length} accent="var(--accent-warn)" />
      </div>

      <Section title="등록 사용자">
        <Table
          columns={["이름", "연락처", "등록일", "상태"]}
          rows={users.map((u) => [
            u.name,
            u.guardianContact || "-",
            fmt(u.createdAt),
            isLegacyUser(u) ? "재등록 필요 (레거시 128-d)" : "ACTIVE (Facenet512)",
          ])}
          empty="등록된 사용자가 없습니다."
        />
      </Section>

      <Section title="출결 로그">
        <Table
          columns={["이름", "시각", "클라이언트 라이브니스", "합성점수", "DeepFace 실물", "cos 거리"]}
          rows={attendanceLogs.map((l) => [
            l.name,
            fmt(l.timestamp),
            l.livenessPassed ? "PASS" : "FAIL",
            `${l.syntheticScore ?? "-"} /100`,
            fmtDeepfaceReal(l.deepfaceIsReal, l.deepfaceAntispoofScore),
            l.matchDistance ?? "-",
          ])}
          empty="출결 기록이 없습니다."
        />
      </Section>

      <Section title="이상 탐지 로그 (위조 판별 실패 / 매칭 실패)">
        <Table
          columns={["시각", "결과", "사유", "클라이언트 라이브니스", "합성점수", "DeepFace 실물"]}
          rows={antiSpoofLogs.map((l) => [
            fmt(l.timestamp),
            l.result,
            l.reason,
            l.livenessPassed ? "PASS" : "FAIL",
            `${l.syntheticScore ?? "-"} /100`,
            fmtDeepfaceReal(l.deepfaceIsReal, l.deepfaceAntispoofScore),
          ])}
          empty="이상 탐지 로그가 없습니다."
          danger
        />
      </Section>
    </div>
  );
}

function StatCard({ label, value, accent = "var(--text)" }) {
  return (
    <div className="panel" style={{ padding: 18 }}>
      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{label}</div>
      <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: accent, marginTop: 6 }}>
        {value}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{title}</h2>
      {children}
    </div>
  );
}

function Table({ columns, rows, empty, danger }) {
  if (rows.length === 0) {
    return (
      <div className="panel" style={{ padding: 24, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
        {empty}
      </div>
    );
  }
  return (
    <div className="panel" style={{ overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "var(--panel-raised)" }}>
            {columns.map((c) => (
              <th key={c} style={{ textAlign: "left", padding: "10px 14px", color: "var(--text-dim)", fontWeight: 600, fontSize: 12 }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={j === 1 ? "mono" : ""}
                  style={{
                    padding: "10px 14px",
                    color: danger && j === 1 ? "var(--accent-danger)" : "var(--text)",
                  }}
                >
                  {String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmt(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", { hour12: false });
}

function fmtDeepfaceReal(isReal, score) {
  if (isReal == null && score == null) return "-";
  const label = isReal === true ? "REAL" : isReal === false ? "SPOOF" : "?";
  const s = typeof score === "number" ? ` (${score.toFixed(2)})` : "";
  return `${label}${s}`;
}
