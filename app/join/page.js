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

// 참여자 가입 = 인증코드로 조직에 들어오기.
//
// 코드를 먼저 받고 계정을 만든다. 순서를 반대로 하면 "가입은 했는데 아무 데도 못 가는"
// 상태가 생기고, 그게 이전 구조의 가장 큰 불만이었다.

export default function JoinPage() {
  return (
    <Suspense fallback={<AuthCard title="인증코드로 참여">불러오는 중...</AuthCard>}>
      <Form />
    </Suspense>
  );
}

function Form() {
  const router = useRouter();
  const params = useSearchParams();

  // 관리자가 링크로 코드를 공유할 수 있게 ?code= 를 받는다.
  const [code, setCode] = useState(normalizeJoinCode(params.get("code") || ""));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [joined, setJoined] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const cleanCode = normalizeJoinCode(code);
    if (cleanCode.length !== 8) {
      setError("인증코드는 8자리입니다. 관리자에게 받은 코드를 확인해주세요.");
      return;
    }
    const invalid = validateSignupForm({ email, password, confirm });
    if (invalid) {
      setError(invalid);
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClientSupabase();

      // 이미 계정이 있는 사람이 코드만 추가로 넣는 경우를 위해, 가입이 실패하면
      // 로그인을 시도해본다. "이미 가입된 이메일입니다" 만 띄우고 끝내면
      // 코드를 넣을 방법이 없어진다.
      let session = null;
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        if (/already registered|already been registered/i.test(signUpError.message)) {
          const { data: loginData, error: loginError } =
            await supabase.auth.signInWithPassword({ email, password });
          if (loginError) {
            setError(
              "이미 가입된 이메일입니다. 비밀번호가 맞지 않으니 기존 비밀번호로 다시 시도해주세요."
            );
            return;
          }
          session = loginData.session;
        } else {
          setError(translateAuthError(signUpError.message));
          return;
        }
      } else {
        session = data.session;
      }

      if (!session) {
        setNeedsConfirm(true);
        try {
          sessionStorage.setItem("pendingJoinCode", cleanCode);
        } catch {
          // 프라이빗 모드 등. 실패해도 /start 에서 다시 입력하면 된다.
        }
        return;
      }

      const res = await fetch("/api/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", code: cleanCode }),
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
      setSubmitting(false);
    }
  }

  if (joined) {
    return (
      <AuthCard title="참여했습니다">
        <Alert type="success">
          <strong>{joined}</strong> 에 참여했습니다.
        </Alert>
        <p style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.7 }}>
          다음은 <strong style={{ color: "var(--text)" }}>얼굴 등록</strong>입니다. 한 번만 등록해두면
          그다음부터는 카메라 앞에 서기만 하면 출석이 기록됩니다.
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
          링크를 누르고 로그인하면 조직 참여가 이어집니다. 메일이 안 보이면 스팸함도 확인해보세요.
        </p>
        <Link href="/login" className="btn btn-primary btn-block" style={{ marginTop: 8 }}>
          로그인하러 가기
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="인증코드로 참여"
      desc="관리자에게 받은 8자리 코드를 입력하세요."
      footer={
        <>
          이미 참여하셨나요?{" "}
          <Link href="/login" style={{ color: "var(--brand)" }}>
            로그인
          </Link>
        </>
      }
      backTo={{ href: "/", label: "처음으로" }}
    >
      <form onSubmit={handleSubmit}>
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
          />
        </Field>
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
        <Button type="submit" disabled={submitting} block>
          {submitting ? "참여하는 중..." : "참여하기"}
        </Button>
      </form>
    </AuthCard>
  );
}
