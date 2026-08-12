import Link from "next/link";
import { cookies } from "next/headers";
import { requireMember } from "@/lib/guards";
import { getUserByAuthId, getAttendanceLogs } from "@/lib/db";
import { getAuthState } from "@/lib/supabaseAuth";
import {
  PageHeader,
  Card,
  Alert,
  Badge,
  DataTable,
  EmptyState,
  formatTime,
} from "@/components/ui";
import SelfEnroll from "./SelfEnroll";

export const dynamic = "force-dynamic";

// 참여자용 화면. 두 가지를 한 곳에서 본다:
//   - 내 얼굴이 등록돼 있는가 (없으면 바로 등록)
//   - 내 출석 기록
//
// 이전 구조에는 참여자가 볼 화면이 아예 없었다. 출결만 찍고 자기 기록은 확인할 수
// 없어서, 제대로 기록됐는지 알 방법이 관리자에게 묻는 것뿐이었다.
export default async function MePage() {
  const { user, org } = await requireMember("/me");
  const { memberships } = await getAuthState(await cookies());

  const profile = await getUserByAuthId(org.orgId, user.id);
  const logs = profile ? await getAttendanceLogs(org.orgId, { userId: profile.id }) : [];

  const today = new Date().toISOString().slice(0, 10);
  const checkedToday = logs.some(
    (l) => new Date(l.timestamp).toISOString().slice(0, 10) === today
  );

  return (
    <div className="page-mid">
      <PageHeader title="내 기록" desc={`${org.orgName} · ${user.email}`} />

      {!profile ? (
        <div className="section">
          <Alert type="warn">
            <span>
              <strong>아직 얼굴이 등록되지 않았습니다.</strong> 한 번만 등록해두면 그다음부터는
              카메라 앞에 서기만 하면 출석이 기록됩니다.
            </span>
          </Alert>
          <Card>
            <h2 className="section-title">얼굴 등록</h2>
            <p style={{ color: "var(--text-dim)", fontSize: 13.5, lineHeight: 1.65, marginTop: 0 }}>
              스캔을 누르면 화면이 지시하는 방향으로 고개를 돌려주세요. 순서는 매번 바뀝니다.
              사진이나 화면으로는 통과할 수 없습니다.
            </p>
            <div style={{ marginTop: 16 }}>
              <SelfEnroll name={user.email.split("@")[0]} />
            </div>
          </Card>
        </div>
      ) : (
        <>
          <div className="section">
            <Card>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 12.5, color: "var(--text-dim)", fontWeight: 600 }}>
                    등록 상태
                  </div>
                  <div style={{ fontSize: 19, fontWeight: 800, marginTop: 4 }}>
                    {profile.name}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginTop: 4 }}>
                    {formatTime(profile.createdAt)} 등록
                  </div>
                </div>
                <div className="stack" style={{ alignItems: "flex-end", gap: 8 }}>
                  <Badge variant="brand">등록 완료</Badge>
                  {checkedToday ? (
                    <Badge variant="brand">오늘 출석함</Badge>
                  ) : (
                    <Link href="/attendance" className="btn btn-primary" style={{ padding: "8px 14px", fontSize: 13 }}>
                      출결 체크하기
                    </Link>
                  )}
                </div>
              </div>
            </Card>
          </div>

          <div className="section">
            <h2 className="section-title">출석 기록</h2>
            <DataTable
              columns={[
                { key: "time", label: "시각", render: (r) => <span className="mono">{r.time}</span> },
                { key: "real", label: "실물 판정" },
                { key: "dist", label: "얼굴 거리", render: (r) => <span className="mono">{r.dist}</span> },
              ]}
              rows={logs.map((l) => ({
                _key: l.id,
                time: formatTime(l.timestamp),
                real: (
                  <Badge variant={l.deepfaceIsReal ? "brand" : "danger"}>
                    {l.deepfaceIsReal ? "실물" : "위조"}
                  </Badge>
                ),
                dist: l.matchDistance ?? "-",
              }))}
              empty={
                <EmptyState
                  title="아직 출석 기록이 없습니다"
                  action={
                    <Link href="/attendance" className="btn btn-primary">
                      출결 체크하러 가기
                    </Link>
                  }
                >
                  출결 체크를 하면 여기에 쌓입니다.
                </EmptyState>
              }
            />
          </div>
        </>
      )}

      {memberships.length > 1 && (
        <div className="section">
          <Alert type="plain">
            <span>
              소속 조직이 {memberships.length}개입니다. 현재 <strong>{org.orgName}</strong> 기준으로
              보고 있습니다.
            </span>
          </Alert>
        </div>
      )}
    </div>
  );
}
