"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FaceEnroll from "@/components/FaceEnroll";
import {
  PageHeader,
  Card,
  Button,
  Alert,
  Badge,
  DataTable,
  EmptyState,
  formatTime,
} from "@/components/ui";

// 등록 관리.
//
// 이전에는 "얼굴 등록" 페이지와 "등록자 목록"(대시보드 안)이 따로 있어서, 등록하고
// 확인하려면 화면을 옮겨다녀야 했다. 한 화면에서 목록을 보고 바로 추가한다.

export default function MembersClient({ orgName, joinCode, users }) {
  const router = useRouter();
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState(null);

  async function remove(user) {
    // 되돌릴 수 없는 삭제라 한 번 확인한다.
    if (!window.confirm(`${user.name}님의 얼굴 등록을 삭제할까요?\n삭제하면 출결 체크가 안 됩니다.`)) {
      return;
    }
    setPendingId(user.id);
    setError("");
    try {
      const res = await fetch(`/api/users?id=${encodeURIComponent(user.id)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "삭제하지 못했습니다.");
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="등록 관리"
        desc={`${orgName} 에 얼굴이 등록된 사람 목록입니다.`}
        action={
          <Button variant={enrolling ? "ghost" : "primary"} onClick={() => setEnrolling((v) => !v)}>
            {enrolling ? "닫기" : "+ 직접 등록"}
          </Button>
        }
      />

      {joinCode && (
        <div style={{ marginTop: 20 }}>
          <Alert type="plain">
            <span>
              참여자는 <strong>인증코드 {joinCode}</strong> 로 직접 가입해서 본인 얼굴을 등록할 수
              있습니다. 아래 &ldquo;직접 등록&rdquo;은 계정 없이 등록해야 할 때만 쓰세요.
            </span>
          </Alert>
        </div>
      )}

      {enrolling && (
        <div className="section">
          <Card>
            <h2 className="section-title">새 얼굴 등록</h2>
            <p style={{ color: "var(--text-dim)", fontSize: 13.5, lineHeight: 1.65, marginTop: 0 }}>
              스캔을 누르면 화면이 지시하는 방향으로 고개를 돌려주세요. 순서는 매번 바뀝니다.
            </p>
            <div style={{ marginTop: 16 }}>
              <FaceEnroll onDone={() => router.refresh()} />
            </div>
          </Card>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 16 }}>
          <Alert type="error">{error}</Alert>
        </div>
      )}

      <div className="section">
        <DataTable
          columns={[
            { key: "name", label: "이름" },
            { key: "contact", label: "보호자 연락처" },
            { key: "created", label: "등록일", render: (r) => <span className="mono">{r.created}</span> },
            { key: "status", label: "상태" },
            { key: "action", label: "" },
          ]}
          rows={users.map((u) => ({
            _key: u.id,
            name: u.name,
            contact: u.guardianContact || <span style={{ color: "var(--text-faint)" }}>-</span>,
            created: formatTime(u.createdAt),
            status: u.legacy ? (
              <Badge variant="warn">재등록 필요</Badge>
            ) : u.selfEnrolled ? (
              <Badge variant="brand">본인 등록</Badge>
            ) : (
              <Badge>관리자 등록</Badge>
            ),
            action: (
              <button
                className="btn btn-danger"
                style={{ padding: "5px 11px", fontSize: 12.5 }}
                disabled={pendingId === u.id}
                onClick={() => remove(u)}
              >
                {pendingId === u.id ? "삭제 중..." : "삭제"}
              </button>
            ),
          }))}
          empty={
            <EmptyState
              title="아직 등록된 사람이 없습니다"
              action={
                <Button onClick={() => setEnrolling(true)}>직접 등록하기</Button>
              }
            >
              참여자에게 인증코드를 알려주면 각자 가입해서 얼굴을 등록할 수 있습니다.
            </EmptyState>
          }
        />
      </div>
    </div>
  );
}
