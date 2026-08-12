"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FaceEnroll from "@/components/FaceEnroll";

// 본인 얼굴 등록.
//
// 이름은 기본값으로 이메일 앞부분을 넣되 고칠 수 있게 둔다. 관리자가 명단에서
// 알아볼 수 있는 이름이어야 하는데, 이메일 아이디가 늘 실명은 아니기 때문이다.
export default function SelfEnroll({ name: defaultName }) {
  const router = useRouter();
  const [name, setName] = useState(defaultName ?? "");
  const [confirmed, setConfirmed] = useState(false);

  if (!confirmed) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) setConfirmed(true);
        }}
      >
        <label className="field">
          <span className="field-label">이름</span>
          <input
            className="input"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="홍길동"
          />
          <span className="field-hint">관리자가 명단에서 알아볼 수 있는 이름으로 적어주세요.</span>
        </label>
        <button type="submit" className="btn btn-primary btn-block">
          다음 — 얼굴 스캔
        </button>
      </form>
    );
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontSize: 14 }}>
          이름: <strong>{name}</strong>
        </span>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: "5px 11px", fontSize: 12.5 }}
          onClick={() => setConfirmed(false)}
        >
          수정
        </button>
      </div>
      <FaceEnroll self fixedName={name} onDone={() => router.refresh()} />
    </>
  );
}
