"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { AuthCard, Field, Input, Button, Alert } from "@/components/ui";
import { normalizeJoinCode } from "@/lib/authMessages";

// 가입 도중 입력했던 값을 되살리기 위해 sessionStorage 를 읽는다.
//
// useEffect + setState 로 하면 마운트 직후 한 번 더 렌더되고, 서버가 그린 화면과
// 다른 화면이 잠깐 스친다. useSyncExternalStore 는 서버용 스냅샷을 따로 받으므로
// 그 깜빡임 없이 읽을 수 있다.
//
// 값은 세션 동안 바뀌지 않으므로 구독은 빈 함수로 둔다.
const noSubscribe = () => () => {};

function usePendingValue(key) {
  return useSyncExternalStore(
    noSubscribe,
    () => {
      try {
        return sessionStorage.getItem(key) ?? "";
      } catch {
        return ""; // 프라이빗 모드 등에서 접근이 막힐 수 있다
      }
    },
    () => "" // 서버에는 sessionStorage 가 없다
  );
}

// 로그인은 했는데 소속 조직이 없는 상태를 받아준다.
//
// 이메일 확인이 켜져 있으면 가입 시점에 세션이 없어서 조직 생성/참여를 못 한다.
// 그래서 확인 메일을 누르고 처음 로그인한 사람은 조직이 하나도 없는 채로 들어온다.
// 이 화면이 없으면 그 사람은 어디로도 가지 못하고 로그인 화면만 맴돈다.
//
// 가입 화면에서 sessionStorage 에 남겨둔 값이 있으면 자동으로 이어붙인다.

export default function StartPage() {
  const router = useRouter();

  const pendingOrgName = usePendingValue("pendingOrgName");
  const pendingCode = usePendingValue("pendingJoinCode");

  // 사용자가 아직 고르지 않았으면(undefined) 가입 도중 값에서 유추한다.
  // 한 번이라도 고르면 그 선택이 이긴다.
  const [modeChoice, setModeChoice] = useState(undefined);
  const mode =
    modeChoice !== undefined
      ? modeChoice
      : pendingOrgName
        ? "create"
        : pendingCode
          ? "join"
          : null;
  const setMode = setModeChoice;

  const [orgNameInput, setOrgNameInput] = useState(null);
  const orgName = orgNameInput ?? pendingOrgName;
  const setOrgName = setOrgNameInput;

  const [codeInput, setCodeInput] = useState(null);
  const code = codeInput ?? pendingCode;
  const setCode = setCodeInput;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { kind, joinCode?, orgName? }

  async function submit(action, payload) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "처리하지 못했습니다.");
        return;
      }
      try {
        sessionStorage.removeItem("pendingOrgName");
        sessionStorage.removeItem("pendingJoinCode");
      } catch {
        // 무시해도 되는 실패
      }
      setResult({ kind: action, ...json });
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (result?.kind === "create") {
    return (
      <AuthCard title="조직이 만들어졌습니다">
        <Alert type="success">
          이제 <strong>{orgName}</strong> 의 관리자입니다.
        </Alert>
        <p style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.7 }}>
          아래 <strong style={{ color: "var(--text)" }}>인증코드</strong>를 참여할 사람에게 알려주세요.
        </p>
        <div className="code-display" style={{ margin: "16px 0" }}>
          {result.joinCode}
        </div>
        <a href="/admin/dashboard" className="btn btn-primary btn-block">
          대시보드로 이동
        </a>
      </AuthCard>
    );
  }

  if (result?.kind === "join") {
    return (
      <AuthCard title="참여했습니다">
        <Alert type="success">
          <strong>{result.orgName}</strong> 에 참여했습니다.
        </Alert>
        <p style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.7 }}>
          다음은 얼굴 등록입니다. 한 번만 등록해두면 그다음부터는 카메라 앞에 서기만 하면 됩니다.
        </p>
        <a href="/me" className="btn btn-primary btn-block" style={{ marginTop: 8 }}>
          얼굴 등록하러 가기
        </a>
      </AuthCard>
    );
  }

  if (mode === "create") {
    return (
      <AuthCard title="조직 만들기" desc="출결을 관리할 조직 이름을 정해주세요.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!orgName.trim()) return setError("조직 이름을 입력해주세요.");
            submit("create", { name: orgName.trim() });
          }}
        >
          <Field label="조직 이름" hint="예: 3학년 2반, OO영어학원, 개발팀">
            <Input
              required
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="우리 반"
              maxLength={60}
            />
          </Field>
          {error && <Alert type="error">{error}</Alert>}
          <Button type="submit" disabled={busy} block>
            {busy ? "만드는 중..." : "조직 만들기"}
          </Button>
        </form>
        <button
          type="button"
          className="btn btn-ghost btn-block"
          style={{ marginTop: 10 }}
          onClick={() => {
            setMode(null);
            setError("");
          }}
        >
          뒤로
        </button>
      </AuthCard>
    );
  }

  if (mode === "join") {
    return (
      <AuthCard title="인증코드 입력" desc="관리자에게 받은 8자리 코드를 입력하세요.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const clean = normalizeJoinCode(code);
            if (clean.length !== 8) return setError("인증코드는 8자리입니다.");
            submit("join", { code: clean });
          }}
        >
          <Field label="인증코드">
            <Input
              className="input-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD2345"
              maxLength={12}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          {error && <Alert type="error">{error}</Alert>}
          <Button type="submit" disabled={busy} block>
            {busy ? "확인 중..." : "참여하기"}
          </Button>
        </form>
        <button
          type="button"
          className="btn btn-ghost btn-block"
          style={{ marginTop: 10 }}
          onClick={() => {
            setMode(null);
            setError("");
          }}
        >
          뒤로
        </button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="어느 쪽으로 시작할까요?" desc="로그인은 됐지만 아직 소속된 조직이 없습니다.">
      <div className="stack">
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => setMode("create")}>
          조직 만들기 (관리자)
        </button>
        <button type="button" className="btn btn-ghost btn-lg btn-block" onClick={() => setMode("join")}>
          인증코드로 참여
        </button>
      </div>
      <p style={{ marginTop: 16, fontSize: 12.5, color: "var(--text-faint)", lineHeight: 1.6 }}>
        조직을 만들면 그 조직의 관리자가 되고, 참여자에게 나눠줄 인증코드가 생깁니다.
      </p>
    </AuthCard>
  );
}
