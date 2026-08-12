"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientSupabase } from "@/lib/supabaseAuth";
import { AuthCard, Field, Input, Button, Alert } from "@/components/ui";
import { translateAuthError } from "@/lib/authMessages";

// 참여자 로그인. 로그인 후 /attendance 로 간다.
// 관리자 로그인(/admin/login)과 계정은 같고, 역할은 memberships 가 결정한다.

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthCard title="로그인">불러오는 중...</AuthCard>}>
      <Form />
    </Suspense>
  );
}

function Form() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next") || "/attendance";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(
    params.get("error") === "config"
      ? "Supabase 환경변수가 설정되지 않았습니다. .env.local 을 확인하세요."
      : ""
  );

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const supabase = createClientSupabase();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(translateAuthError(signInError.message));
        return;
      }
      router.replace(nextPath);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="참여자 로그인"
      desc="출결 체크와 내 기록을 볼 수 있습니다."
      backTo={{ href: "/", label: "처음으로" }}
    >
      <form onSubmit={handleSubmit}>
        <Field label="이메일">
          <Input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="비밀번호">
          <Input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && <Alert type="error">{error}</Alert>}
        <Button type="submit" disabled={submitting} block>
          {submitting ? "로그인 중..." : "로그인"}
        </Button>
      </form>

      {/* 계정이 없는 사람이 여기 먼저 온다. 인증코드를 받아 든 사람의 머릿속은
          "이걸 어디 넣지?" 인데, 자연스럽게 로그인을 먼저 누르기 때문이다.
          작은 글씨 링크로 두었더니 회원가입이 없는 것처럼 보였다. */}
      <div
        style={{
          marginTop: 20,
          paddingTop: 18,
          borderTop: "1px solid var(--border)",
        }}
      >
        <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "0 0 10px" }}>
          계정이 없으신가요? 관리자에게 받은 <strong style={{ color: "var(--text)" }}>인증코드</strong>로
          가입할 수 있습니다.
        </p>
        <Link href="/join" className="btn btn-ghost btn-block">
          참여자 회원가입
        </Link>
      </div>

      <p style={{ marginTop: 16, fontSize: 12.5, color: "var(--text-faint)", lineHeight: 1.6 }}>
        조직을 관리하시는 분은{" "}
        <Link href="/admin/login" style={{ color: "var(--text-dim)" }}>
          관리자 로그인
        </Link>
        을 이용하세요.
      </p>
    </AuthCard>
  );
}
