"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientSupabase } from "@/lib/supabaseAuth";
import { AuthCard, Field, Input, Button, Alert } from "@/components/ui";
import { translateAuthError } from "@/lib/authMessages";

// 관리자 로그인. 참여자 로그인(/login)과 화면을 나눈 이유는, 로그인 후 갈 곳과
// 실패했을 때 안내할 내용이 다르기 때문이다.
// 계정 자체는 같은 Supabase Auth 를 쓰고, 역할은 memberships 가 결정한다.

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<AuthCard title="관리자 로그인">불러오는 중...</AuthCard>}>
      <Form />
    </Suspense>
  );
}

function Form() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next") || "/admin/dashboard";

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
      // 세션 쿠키가 반영된 상태로 서버 컴포넌트를 다시 렌더링해야 한다.
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
      title="관리자 로그인"
      desc="조직의 대시보드와 등록 관리로 들어갑니다."
      footer={
        <>
          아직 조직이 없으신가요?{" "}
          <Link href="/admin/signup" style={{ color: "var(--brand)" }}>
            조직 만들기
          </Link>
        </>
      }
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
      <p style={{ marginTop: 16, fontSize: 12.5, color: "var(--text-faint)", lineHeight: 1.6 }}>
        참여자로 출결만 하실 분은{" "}
        <Link href="/login" style={{ color: "var(--text-dim)" }}>
          참여자 로그인
        </Link>
        을 이용하세요.
      </p>
    </AuthCard>
  );
}
