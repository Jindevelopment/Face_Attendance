import Link from "next/link";
import { getUsers, getAttendanceLogs, getAntiSpoofLogs, isLegacyUser } from "@/lib/db";
import { requireOrgAdmin } from "@/lib/guards";
import {
  PageHeader,
  Stat,
  Badge,
  Alert,
  DataTable,
  EmptyState,
  formatTime,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // 데이터를 조회하기 전에 인가를 확인한다. org 를 여기서 받아 모든 조회를 좁힌다.
  const { org } = await requireOrgAdmin("/admin/dashboard");

  const [users, attendanceLogs, antiSpoofLogs] = await Promise.all([
    getUsers(org.orgId),
    getAttendanceLogs(org.orgId),
    getAntiSpoofLogs(org.orgId),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const isToday = (l) => new Date(l.timestamp).toISOString().slice(0, 10) === today;
  const todayCount = attendanceLogs.filter(isToday).length;
  const spoofToday = antiSpoofLogs.filter(isToday).length;
  const legacyCount = users.filter(isLegacyUser).length;

  return (
    <div className="page">
      <PageHeader
        title="대시보드"
        desc={`${org.orgName} 의 출결 현황과 이상 탐지 기록입니다.`}
        action={
          <Link href="/admin/members" className="btn btn-ghost">
            등록 관리
          </Link>
        }
      />

      {legacyCount > 0 && (
        <div style={{ marginTop: 20 }}>
          <Alert type="warn">
            <span>
              <strong>재등록 필요:</strong> 구버전(face-api.js 128차원)으로 저장된 사용자{" "}
              <strong>{legacyCount}명</strong>이 매칭 대상에서 빠져 있습니다. 다시 등록해주세요.
            </span>
          </Alert>
        </div>
      )}

      <div className="section">
        <div className="stat-grid">
          <Stat label="등록 인원" value={users.length} />
          <Stat label="오늘 출석" value={todayCount} variant="brand" />
          <Stat label="오늘 위조 탐지" value={spoofToday} variant={spoofToday > 0 ? "danger" : undefined} />
          <Stat label="누적 이상 탐지" value={antiSpoofLogs.length} variant={antiSpoofLogs.length > 0 ? "warn" : undefined} />
        </div>
      </div>

      <div className="section">
        <h2 className="section-title">출결 기록</h2>
        <DataTable
          columns={[
            { key: "name", label: "이름" },
            { key: "time", label: "시각", render: (r) => <span className="mono">{r.time}</span> },
            { key: "real", label: "실물 판정" },
            { key: "dist", label: "얼굴 거리", render: (r) => <span className="mono">{r.dist}</span> },
          ]}
          rows={attendanceLogs.map((l) => ({
            _key: l.id,
            name: l.name ?? "-",
            time: formatTime(l.timestamp),
            real: <RealBadge isReal={l.deepfaceIsReal} score={l.deepfaceAntispoofScore} />,
            dist: l.matchDistance ?? "-",
          }))}
          empty={
            <EmptyState title="아직 출석 기록이 없습니다">
              등록된 사람이 출결 체크를 하면 여기에 쌓입니다.
            </EmptyState>
          }
        />
      </div>

      <div className="section">
        <h2 className="section-title">이상 탐지 (위조 의심 / 매칭 실패)</h2>
        <DataTable
          columns={[
            { key: "time", label: "시각", render: (r) => <span className="mono">{r.time}</span> },
            { key: "result", label: "결과" },
            { key: "reason", label: "사유" },
            { key: "real", label: "실물 판정" },
          ]}
          rows={antiSpoofLogs.map((l) => ({
            _key: l.id,
            time: formatTime(l.timestamp),
            result: (
              <Badge variant={l.result === "REJECTED_SPOOF" ? "danger" : "warn"}>
                {l.result === "REJECTED_SPOOF" ? "위조 의심" : "매칭 실패"}
              </Badge>
            ),
            reason: (
              <span style={{ color: "var(--text-dim)", whiteSpace: "normal" }}>{l.reason || "-"}</span>
            ),
            real: <RealBadge isReal={l.deepfaceIsReal} score={l.deepfaceAntispoofScore} />,
          }))}
          empty={
            <EmptyState title="이상 탐지 기록이 없습니다">
              사진이나 화면으로 통과를 시도한 흔적이 여기에 남습니다.
            </EmptyState>
          }
        />
      </div>
    </div>
  );
}

function RealBadge({ isReal, score }) {
  if (isReal == null) return <span style={{ color: "var(--text-faint)" }}>-</span>;
  const s = typeof score === "number" ? score.toFixed(2) : null;
  return (
    <Badge variant={isReal ? "brand" : "danger"}>
      {isReal ? "실물" : "위조"}
      {s && <span className="mono" style={{ opacity: 0.7 }}>{s}</span>}
    </Badge>
  );
}
