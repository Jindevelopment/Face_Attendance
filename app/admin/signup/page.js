"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClientSupabase } from "@/lib/supabaseAuth";
import { AuthCard, Field, Input, Button, Alert } from "@/components/ui";
import { translateAuthError, validateSignupForm, MIN_PASSWORD } from "@/lib/authMessages";

// 관리자 가입 = 조직 생성.
//
// 예전에는 가입한 뒤 Supabase SQL Editor 에서 admins 테이블에 직접 insert 해야
// 관리자가 됐다. 조직이 없던 시절에는 "가입 = 관리자" 로 두면 아무나 가입해서
// 등록자 전원의 정보를 볼 수 있었기 때문이다.
//
// 이제 데이터가 조직 단위로 갈리므로, 가입자는 자기가 만든 조직만 본다.
// 수동 SQL 단계 없이 가입 즉시 자기 조직의 관리자가 된다.

export default function AdminSignupPage() {
  const router = useRouter();

  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [joinCode, setJoinCode] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!orgName.trim()) {
      setError("조직 이름을 입력해주세요.");
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
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(translateAuthError(signUpError.message));
        return;
      }

      // 이메일 확인이 켜져 있으면 세션 없이 계정만 만들어진다.
      // 세션이 없으면 create_organization 의 auth.uid() 가 비어 실패하므로,
      // 조직 생성은 확인 후 첫 로그인 시점(/start)으로 미룬다.
      if (!data.session) {
        setNeedsConfirm(true);
        // 조직 이름을 잃어버리지 않도록 넘겨둔다. 확인 메일을 누르고 돌아왔을 때
        // 처음부터 다시 입력하게 하면 이탈한다.
        try {
          sessionStorage.setItem("pendingOrgName", orgName.trim());
        } catch {
          // 프라이빗 모드 등에서 실패할 수 있다. 실패해도 /start 에서 다시 입력하면 된다.
        }
        return;
      }

      const res = await fetch("/api/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name: orgName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "조직을 만들지 못했습니다.");
        return;
      }
      setJoinCode(json.joinCode);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (joinCode) {
    return (
      <AuthCard title="조직이 만들어졌습니다">
        <Alert type="success">
          이제 <strong>{orgName}</strong> 의 관리자입니다.
        </Alert>
        <p style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.7, marginTop: 4 }}>
          아래가 <strong style={{ color: "var(--text)" }}>인증코드</strong>입니다. 참여할 사람에게
          알려주세요. 이 코드를 입력한 사람만 조직에 들어올 수 있습니다.
        </p>
        <div className="code-display" style={{ margin: "16px 0" }}>
          {joinCode}
        </div>
        <Alert type="plain">
          코드는 나중에 <strong>인증코드</strong> 메뉴에서 다시 볼 수 있고, 외부로 새면
          새 코드로 바꿀 수 있습니다.
        </Alert>
        <Link href="/admin/dashboard" className="btn btn-primary btn-block">
          대시보드로 이동
        </Link>
      </AuthCard>
    );
  }

  if (needsConfirm) {
    return (
      <AuthCard title="메일을 확인해주세요">
        <Alert type="success">
          <strong>{email}</strong> 으로 확인 메일을 보냈습니다. 메일의 링크를 누르면 가입이
          끝납니다.
        </Alert>
        <p style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.7 }}>
          확인을 마치고 로그인하면 <strong style={{ color: "var(--text)" }}>{orgName}</strong> 조직
          생성이 이어집니다. 메일이 안 보이면 스팸함도 확인해보세요.
        </p>
        <Link href="/admin/login" className="btn btn-primary btn-block" style={{ marginTop: 8 }}>
          로그인하러 가기
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="조직 만들기"
      desc="출결을 관리할 조직을 만듭니다. 만들면 참여자에게 나눠줄 인증코드가 나옵니다."
      footer={
        <>
          이미 계정이 있으신가요?{" "}
          <Link href="/admin/login" style={{ color: "var(--brand)" }}>
            관리자 로그인
          </Link>
        </>
      }
      backTo={{ href: "/", label: "처음으로" }}
    >
      <form onSubmit={handleSubmit}>
        <Field label="조직 이름" hint="예: 3학년 2반, OO영어학원, 개발팀">
          <Input
            required
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="우리 반"
            maxLength={60}
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
          {submitting ? "만드는 중..." : "조직 만들기"}
        </Button>
      </form>
    </AuthCard>
  );
}
