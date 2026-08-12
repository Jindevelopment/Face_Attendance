import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabaseAuth";

// 조직 생성 / 참여 / 인증코드 재발급.
//
// 이 라우트는 service_role 이 아니라 "로그인한 사용자의 세션" 으로 RPC 를 호출한다.
// 그래야 DB 함수 안의 auth.uid() 가 실제 호출자를 가리킨다. service_role 로 부르면
// auth.uid() 가 비어서, 누구인지 본문으로 받아야 하고 그 순간 남을 사칭할 수 있게 된다.

async function rpc(name, args) {
  const cookieStore = await cookies();
  const supabase = createServerSupabase(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { denied: { error: "unauthorized", message: "로그인이 필요합니다.", status: 401 } };
  }

  const { data, error } = await supabase.rpc(name, args);
  return { data, error, user };
}

// DB 함수가 raise exception 으로 던지는 사유를 사용자 문구로 옮긴다.
function explain(message) {
  if (/invalid_code/.test(message)) {
    return "인증코드가 올바르지 않습니다. 관리자에게 다시 확인해주세요.";
  }
  if (/org_name_required/.test(message)) return "조직 이름을 입력해주세요.";
  if (/not_admin/.test(message)) return "이 조직의 관리자만 할 수 있습니다.";
  if (/not_authenticated/.test(message)) return "로그인이 필요합니다.";
  return message;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { action } = body || {};

  if (action === "create") {
    const { data, error, denied } = await rpc("create_organization", {
      org_name: body.name ?? "",
    });
    if (denied) return NextResponse.json(denied, { status: denied.status });
    if (error) {
      return NextResponse.json({ error: explain(error.message) }, { status: 400 });
    }
    // 반환 컬럼에 o_ 접두사가 붙어 있다. 접두사 없이 org_id 로 두면 PL/pgSQL 안에서
    // 테이블 컬럼과 충돌해 "ambiguous" 로 실패한다 (0004_fix_ambiguous_org_id.sql).
    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json(
      { orgId: row.o_org_id, joinCode: row.o_join_code },
      { status: 201 }
    );
  }

  if (action === "join") {
    const { data, error, denied } = await rpc("join_organization", {
      code: body.code ?? "",
    });
    if (denied) return NextResponse.json(denied, { status: denied.status });
    if (error) {
      return NextResponse.json({ error: explain(error.message) }, { status: 400 });
    }
    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ orgId: row.o_org_id, orgName: row.o_org_name });
  }

  if (action === "rotate") {
    const { data, error, denied } = await rpc("rotate_join_code", {
      target_org: body.orgId ?? null,
    });
    if (denied) return NextResponse.json(denied, { status: denied.status });
    if (error) {
      return NextResponse.json({ error: explain(error.message) }, { status: 400 });
    }
    return NextResponse.json({ joinCode: data });
  }

  return NextResponse.json({ error: "알 수 없는 action 입니다." }, { status: 400 });
}
