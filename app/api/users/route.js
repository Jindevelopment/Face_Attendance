import { NextResponse } from "next/server";
import { getUsers, addUser, deleteUser, CURRENT_EMBEDDING_DIM } from "@/lib/db";
import { checkAdminApi } from "@/lib/requireAdmin";

// 주의: 이 응답에는 embedding(얼굴 생체정보)이 포함되지 않는다.
// lib/db.js 의 getUsers() 가 애초에 해당 컬럼을 select 하지 않는다.
//
// 이전 구현은 embedding 을 통째로 내려줬고, 출결 페이지가 브라우저에서 그것을 받아
// 매칭했다. 그 방식은 이 엔드포인트를 호출하는 누구에게나 등록자 전원의 생체정보를
// 노출한다. 매칭은 /api/match 로 옮겨 서버(pgvector)에서 수행한다.
export async function GET() {
  const denied = await checkAdminApi();
  if (denied) return NextResponse.json(denied, { status: denied.status });
  try {
    const users = await getUsers();
    return NextResponse.json({ users });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  const denied = await checkAdminApi();
  if (denied) return NextResponse.json(denied, { status: denied.status });

  const body = await request.json();
  const { name, guardianContact, embedding } = body;

  if (!name) {
    return NextResponse.json({ error: "name 은 필수입니다." }, { status: 400 });
  }
  // 차원까지 검사한다. DB 의 vector(512) 제약이 최종 방어선이지만, 여기서 걸러야
  // 사용자에게 원인을 알려줄 수 있다 (제약 위반 메시지는 그대로 노출하기 어렵다).
  if (!Array.isArray(embedding) || embedding.length !== CURRENT_EMBEDDING_DIM) {
    return NextResponse.json(
      {
        error: `embedding 은 ${CURRENT_EMBEDDING_DIM}차원 배열이어야 합니다.`,
        received: Array.isArray(embedding) ? `${embedding.length}차원` : typeof embedding,
      },
      { status: 400 }
    );
  }

  try {
    const user = await addUser({ name, guardianContact, embedding });
    return NextResponse.json({ user }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const denied = await checkAdminApi();
  if (denied) return NextResponse.json(denied, { status: denied.status });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
  }
  try {
    await deleteUser(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
