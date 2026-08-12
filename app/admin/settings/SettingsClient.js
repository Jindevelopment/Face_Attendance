"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, Card, Button, Alert } from "@/components/ui";

// 인증코드 관리.
//
// 코드는 조직의 문을 여는 열쇠다. 한 번 퍼지면 되돌릴 방법이 있어야 하므로
// 재발급을 제공한다. 재발급하면 이전 코드는 즉시 무효가 된다.

export default function SettingsClient({ orgId, orgName, joinCode }) {
  const router = useRouter();
  const [code, setCode] = useState(joinCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const joinUrl =
    typeof window !== "undefined" ? `${window.location.origin}/join?code=${code}` : "";

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("복사하지 못했습니다. 코드를 직접 선택해서 복사해주세요.");
    }
  }

  async function rotate() {
    if (
      !window.confirm(
        "새 코드로 바꾸면 지금 코드는 바로 쓸 수 없게 됩니다.\n이미 참여한 사람은 그대로 유지됩니다.\n\n계속할까요?"
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rotate", orgId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "재발급하지 못했습니다.");
      setCode(json.joinCode);
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-mid">
      <PageHeader title="인증코드" desc={`${orgName} 에 참여하려면 이 코드가 필요합니다.`} />

      <div className="section">
        <Card>
          <div className="code-display">{code}</div>

          <div className="row" style={{ marginTop: 16, gap: 8 }}>
            <Button variant="ghost" onClick={() => copy(code)}>
              {copied ? "복사됨" : "코드 복사"}
            </Button>
            <Button variant="ghost" onClick={() => copy(joinUrl)}>
              참여 링크 복사
            </Button>
            <Button variant="danger" onClick={rotate} disabled={busy}>
              {busy ? "바꾸는 중..." : "새 코드로 바꾸기"}
            </Button>
          </div>

          {error && (
            <div style={{ marginTop: 14 }}>
              <Alert type="error">{error}</Alert>
            </div>
          )}
        </Card>
      </div>

      <div className="section">
        <h2 className="section-title">참여 방법 안내</h2>
        <Card>
          <ol style={{ margin: 0, paddingLeft: 20, color: "var(--text-dim)", fontSize: 14, lineHeight: 1.9 }}>
            <li>
              참여자에게 <strong style={{ color: "var(--text)" }}>인증코드</strong> 또는 참여 링크를
              전달합니다.
            </li>
            <li>
              참여자는 <strong style={{ color: "var(--text)" }}>인증코드로 참여</strong> 화면에서 코드와
              이메일·비밀번호를 입력해 가입합니다.
            </li>
            <li>가입 후 본인 얼굴을 한 번 등록합니다.</li>
            <li>그다음부터는 출결 체크 화면에서 카메라 앞에 서기만 하면 됩니다.</li>
          </ol>
        </Card>
      </div>

      <div className="section">
        <Alert type="warn">
          <span>
            코드가 외부로 새면 모르는 사람이 조직에 들어올 수 있습니다. 그럴 때{" "}
            <strong>새 코드로 바꾸기</strong>를 누르세요. 이미 참여한 사람은 영향을 받지 않습니다.
          </span>
        </Alert>
      </div>
    </div>
  );
}
