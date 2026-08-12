"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClientSupabase } from "@/lib/supabaseAuth";
import { AuthCard, Field, SubmitButton, Notice } from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthCard title="로그인">불러오는 중...</AuthCard>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // 리다이렉트로 넘어온 사유를 화면에 설명한다.
  // not_admin 은 "로그인은 됐지만 권한이 없음" 이라, 안내가 없으면 사용자는 비밀번호가
  // 틀린 줄 알고 같은 화면에서 계속 재시도하게 된다.
  const reason = params.get("error");
  const [error, setError] = useState(
    reason === "config"
      ? "Supabase 환경변수가 설정되지 않았습니다. .env.local 을 확인해주세요."
      : reason === "not_admin"
        ? "로그인은 되었지만 관리자 권한이 없습니다. 대시보드와 얼굴 등록은 관리자만 사용할 수 있습니다."
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
        // Supabase 는 "이메일이 없음" 과 "비밀번호가 틀림" 을 구분하지 않는다.
        // 계정 존재 여부를 알려주지 않는 편이 안전하므로 그대로 둔다.
        setError(
          signInError.message === "Invalid login credentials"
            ? "이메일 또는 비밀번호가 올바르지 않습니다."
            : signInError.message
        );
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
    <AuthCard title="로그인" desc="관리자 계정으로 로그인하면 대시보드와 얼굴 등록에 접근할 수 있습니다.">
      <form onSubmit={handleSubmit}>
        <Field label="이메일">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="auth-input"
          />
        </Field>
        <Field label="비밀번호">
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-input"
          />
        </Field>
        {error && <Notice type="error">{error}</Notice>}
        <SubmitButton disabled={submitting}>
          {submitting ? "로그인 중..." : "로그인"}
        </SubmitButton>
      </form>
      <p style={{ marginTop: 18, fontSize: 13, color: "var(--text-dim)" }}>
        계정이 없으신가요?{" "}
        <Link href="/signup" style={{ color: "var(--accent-verify)" }}>
          회원가입
        </Link>
      </p>
    </AuthCard>
  );
}
