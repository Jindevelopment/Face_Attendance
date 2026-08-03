import { getUsers, getAttendanceLogs, getAntiSpoofLogs } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const users = getUsers();
  const attendanceLogs = getAttendanceLogs();
  const antiSpoofLogs = getAntiSpoofLogs();

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = attendanceLogs.filter((l) => l.timestamp.startsWith(today)).length;
  const spoofToday = antiSpoofLogs.filter((l) => l.timestamp.startsWith(today)).length;

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>관리자 대시보드</h1>
      <p style={{ color: "var(--text-dim)", fontSize: 14, marginTop: 6, marginBottom: 32 }}>
        출결 현황과 위조 판별 이상 탐지 로그를 확인합니다.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 36 }}>
        <StatCard label="등록 사용자" value={users.length} />
        <StatCard label="오늘 출결" value={todayCount} accent="var(--accent-verify)" />
        <StatCard label="오늘 위조 탐지" value={spoofToday} accent="var(--accent-danger)" />
        <StatCard label="누적 이상 탐지" value={antiSpoofLogs.length} accent="var(--accent-warn)" />
      </div>

      <Section title="등록 사용자">
        <Table
          columns={["이름", "연락처", "등록일"]}
          rows={users.map((u) => [u.name, u.guardianContact || "-", fmt(u.createdAt)])}
          empty="등록된 사용자가 없습니다."
        />
      </Section>

      <Section title="출결 로그">
        <Table
          columns={["이름", "시각", "라이브니스", "합성점수", "매칭거리"]}
          rows={attendanceLogs.map((l) => [
            l.name,
            fmt(l.timestamp),
            l.livenessPassed ? "PASS" : "FAIL",
            `${l.syntheticScore ?? "-"} /100`,
            l.matchDistance ?? "-",
          ])}
          empty="출결 기록이 없습니다."
        />
      </Section>

      <Section title="이상 탐지 로그 (위조 판별 실패 / 매칭 실패)">
        <Table
          columns={["시각", "결과", "사유", "라이브니스", "합성점수"]}
          rows={antiSpoofLogs.map((l) => [
            fmt(l.timestamp),
            l.result,
            l.reason,
            l.livenessPassed ? "PASS" : "FAIL",
            `${l.syntheticScore ?? "-"} /100`,
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
