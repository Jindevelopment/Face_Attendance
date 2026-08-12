"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientSupabase } from "@/lib/supabaseAuth";
import { AuthCard, Field, Input, Button, Alert } from "@/components/ui";
import {
  translateAuthError,
  validateSignupForm,
  normalizeJoinCode,
  MIN_PASSWORD,
} from "@/lib/authMessages";

// 참여자 가입: ① 계정 만들기 → ② 인증코드로 조직 참여.
//
// 처음에는 한 폼에 다 넣었는데, 코드가 첫 칸이라 "코드가 있어야 가입이 되나" 처럼
// 읽혔다. 사람이 생각하는 순서(가입하고 나서 코드를 넣는다)대로 나눈다.
//
// 두 단계를 한 화면(라우트)에서 처리하는 이유: 1단계 성공 직후 곧바로 2단계를
// 보여줘야 "가입은 됐는데 어디로 가야 하는지 모르는" 상태가 안 생긴다.
// 중간에 이탈해도 다음 로그인 때 /start 가 같은 코드 입력을 받아준다.

export default function JoinPage() {
  return (
    <Suspense fallback={<AuthCard title="참여자 회원가입">불러오는 중...</AuthCard>}>
      <Flow />
    </Suspense>
  );
}

function Flow() {
  const router = useRouter();
  const params = useSearchParams();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // 관리자가 링크로 코드를 공유할 수 있게 ?code= 를 받는다.
  const [code, setCode] = useState(normalizeJoinCode(params.get("code") || ""));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [joined, setJoined] = useState(null);

  // --- 1단계: 계정 만들기 ---------------------------------------------------
  async function handleSignup(e) {
    e.preventDefault();
    setError("");

    const invalid = validateSignupForm({ email, password, confirm });
    if (invalid) {
      setError(invalid);
      return;
    }

    setBusy(true);
    try {
      const supabase = createClientSupabase();
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });

      if (signUpError) {
        // 이미 계정이 있는 사람이 여기로 온 경우. 로그인시켜 2단계로 보낸다.
        // "이미 가입된 이메일입니다" 만 띄우고 끝내면 코드를 넣을 방법이 없어진다.
        if (/already registered|already been registered/i.test(signUpError.message)) {
          const { data: loginData, error: loginError } =
            await supabase.auth.signInWithPassword({ email, password });
          if (loginError) {
            setError(
              /Email not confirmed/i.test(loginError.message)
                ? "이미 가입된 이메일인데 확인이 끝나지 않았습니다. 받은 확인 메일의 링크를 먼저 눌러주세요."
                : "이미 가입된 이메일입니다. 기존 비밀번호로 다시 시도해주세요."
            );
            return;
          }
          setStep(2);
          return;
        }
        setError(translateAuthError(signUpError.message));
        return;
      }

      // 이메일 확인이 켜져 있으면 세션 없이 계정만 만들어진다.
      // 세션이 없으면 join_organization 의 auth.uid() 가 비어 실패하므로,
      // 코드 입력은 확인 후 첫 로그인 시점(/start)으로 미룬다.
      if (!data.session) {
        setNeedsConfirm(true);
        if (code) {
          try {
            sessionStorage.setItem("pendingJoinCode", code);
          } catch {
            // 프라이빗 모드 등. 실패해도 /start 에서 다시 입력하면 된다.
          }
        }
        return;
      }

      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // --- 2단계: 인증코드로 참여 -----------------------------------------------
  async function handleJoin(e) {
    e.preventDefault();
    setError("");

    const clean = normalizeJoinCode(code);
    if (clean.length !== 8) {
      setError("인증코드는 8자리입니다. 관리자에게 받은 코드를 확인해주세요.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", code: clean }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "참여하지 못했습니다.");
        return;
      }
      setJoined(json.orgName);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // --- 결과 화면 ------------------------------------------------------------

  if (joined) {
    return (
      <AuthCard title="참여 완료">
        <Alert type="success">
          <strong>{joined}</strong> 에 참여했습니다.
        </Alert>
        <p style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.7 }}>
          마지막으로 <strong style={{ color: "var(--text)" }}>얼굴 등록</strong>이 남았습니다. 한 번만
          등록해두면 그다음부터는 카메라 앞에 서기만 하면 출석이 기록됩니다.
        </p>
        <Link href="/me" className="btn btn-primary btn-block" style={{ marginTop: 8 }}>
          얼굴 등록하러 가기
        </Link>
      </AuthCard>
    );
  }

  if (needsConfirm) {
    return (
      <AuthCard title="메일을 확인해주세요">
        <Alert type="success">
          <strong>{email}</strong> 으로 확인 메일을 보냈습니다.
        </Alert>
        <p style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.7 }}>
          메일의 링크를 누르고 로그인하면 인증코드 입력으로 이어집니다. 메일이 안 보이면
          스팸함도 확인해보세요.
        </p>
        <Link href="/login" className="btn btn-primary btn-block" style={{ marginTop: 8 }}>
          로그인하러 가기
        </Link>
      </AuthCard>
    );
  }

  // --- 폼 -------------------------------------------------------------------

  if (step === 2) {
    return (
      <AuthCard title="인증코드 입력" desc="관리자에게 받은 8자리 코드를 넣으면 참여가 끝납니다.">
        <Steps current={2} />
        <Alert type="success">계정이 만들어졌습니다. 이제 참여할 조직을 지정해주세요.</Alert>
        <form onSubmit={handleJoin}>
          <Field label="인증코드" hint="대소문자는 구분하지 않습니다. 공백이 섞여도 괜찮습니다.">
            <Input
              className="input-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD2345"
              maxLength={12}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
          </Field>
          {error && <Alert type="error">{error}</Alert>}
          <Button type="submit" disabled={busy} block size="lg">
            {busy ? "확인 중..." : "참여하기"}
          </Button>
        </form>
        <p style={{ marginTop: 16, fontSize: 12.5, color: "var(--text-faint)", lineHeight: 1.6 }}>
          코드를 아직 못 받으셨나요? 지금 닫아도 계정은 남아 있습니다. 다음에 로그인하면
          여기서부터 다시 이어집니다.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="참여자 회원가입"
      desc="계정을 만든 다음, 관리자에게 받은 인증코드로 조직에 참여합니다."
      footer={
        <>
          이미 계정이 있으신가요?{" "}
          <Link href="/login" style={{ color: "var(--brand)" }}>
            로그인
          </Link>
        </>
      }
      backTo={{ href: "/", label: "처음으로" }}
    >
      <Steps current={1} />
      <form onSubmit={handleSignup}>
        <Field label="이메일">
          <Input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label={`비밀번호 (${MIN_PASSWORD}자 이상)`}>
          <Input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="비밀번호 확인">
          <Input
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        {error && <Alert type="error">{error}</Alert>}
        <Button type="submit" disabled={busy} block size="lg">
          {busy ? "가입하는 중..." : "다음 — 인증코드 입력"}
        </Button>
      </form>
    </AuthCard>
  );
}

// 지금 어디쯤인지, 다음에 뭐가 남았는지 보여준다.
// 두 단계짜리라도 표시가 없으면 1단계에서 끝난 줄 알고 닫아버린다.
function Steps({ current }) {
  const items = [
    { n: 1, label: "계정 만들기" },
    { n: 2, label: "인증코드" },
  ];
  return (
    <div className="row" style={{ gap: 8, marginBottom: 18 }}>
      {items.map((it, i) => {
        const done = current > it.n;
        const active = current === it.n;
        return (
          <div key={it.n} className="row" style={{ gap: 8 }}>
            <span
              className="mono"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 22,
                height: 22,
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                background: active || done ? "var(--brand)" : "var(--surface-3)",
                color: active || done ? "var(--brand-ink)" : "var(--text-faint)",
              }}
            >
              {done ? "✓" : it.n}
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                color: active ? "var(--text)" : "var(--text-faint)",
              }}
            >
              {it.label}
            </span>
            {i === 0 && (
              <span style={{ color: "var(--text-faint)", margin: "0 2px" }}>→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
