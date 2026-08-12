"use client";

import { useState } from "react";
import Link from "next/link";
import { createClientSupabase } from "@/lib/supabaseAuth";
import { AuthCard, Field, SubmitButton, Notice } from "@/components/AuthForm";

const MIN_PASSWORD = 8;

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null); // { needsEmailConfirm: boolean }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password.length < MIN_PASSWORD) {
      setError(`비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다.`);
      return;
    }
    if (password !== confirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClientSupabase();
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      // 이메일 확인이 켜져 있으면 세션 없이 사용자만 생성된다.
      setDone({ needsEmailConfirm: !data.session });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <AuthCard title="가입 완료">
        <Notice type="success">
          {done.needsEmailConfirm
            ? "확인 메일을 보냈습니다. 메일의 링크를 눌러 인증을 마쳐주세요."
            : "계정이 생성되었습니다."}
        </Notice>
        <Notice type="info">
          <strong>아직 관리자 권한은 없습니다.</strong> 가입만으로는 대시보드와 얼굴 등록에
          접근할 수 없습니다. 가입 = 관리자로 두면 누구나 가입해서 등록자 전원의 이름·연락처·
          출결 기록을 볼 수 있기 때문입니다.
          <br />
          <br />
          기존 관리자가 Supabase SQL Editor 에서 이 계정을 <code>public.admins</code> 에
          추가해야 합니다. 방법은 <code>supabase/migrations/0002_auth.sql</code> 하단 주석을
          참고하세요.
        </Notice>
        <p style={{ fontSize: 13 }}>
          <Link href="/login" style={{ color: "var(--accent-verify)" }}>
            로그인하러 가기 →
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="회원가입"
      desc="관리자 계정을 만듭니다. 가입 후 기존 관리자가 권한을 부여해야 대시보드에 접근할 수 있습니다."
    >
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
        <Field label={`비밀번호 (${MIN_PASSWORD}자 이상)`}>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-input"
          />
        </Field>
        <Field label="비밀번호 확인">
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="auth-input"
          />
        </Field>
        {error && <Notice type="error">{error}</Notice>}
        <SubmitButton disabled={submitting}>
          {submitting ? "가입 중..." : "가입하기"}
        </SubmitButton>
      </form>
      <p style={{ marginTop: 18, fontSize: 13, color: "var(--text-dim)" }}>
        이미 계정이 있으신가요?{" "}
        <Link href="/login" style={{ color: "var(--accent-verify)" }}>
          로그인
        </Link>
      </p>
    </AuthCard>
  );
}
