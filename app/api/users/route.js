import {
  getUsers,
  addUser,
  deleteUser,
  getUserByAuthId,
  CURRENT_EMBEDDING_DIM,
} from "@/lib/db";
import { NextResponse } from "next/server";
import { checkOrgAdminApi, checkMemberApi } from "@/lib/guards";

// 주의: 이 응답에는 embedding(얼굴 생체정보)이 포함되지 않는다.
// lib/db.js 의 getUsers() 가 애초에 해당 컬럼을 select 하지 않는다.
//
// 이전 구현은 embedding 을 통째로 내려줬고, 출결 페이지가 브라우저에서 그것을 받아
// 매칭했다. 그 방식은 이 엔드포인트를 호출하는 누구에게나 등록자 전원의 생체정보를
// 노출한다. 매칭은 /api/match 로 옮겨 서버(pgvector)에서 수행한다.
//
// 조직은 항상 세션에서 정한다. 본문이나 쿼리로 받으면 남의 조직을 지목할 수 있다.

export async function GET() {
  const auth = await checkOrgAdminApi();
  if (auth.denied) return NextResponse.json(auth.denied, { status: auth.denied.status });
  try {
    const users = await getUsers(auth.org.orgId);
    return NextResponse.json({ users });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// 등록은 두 경우가 있다:
//   1) 관리자가 남을 등록한다 (이름·보호자 연락처를 직접 입력)
//   2) 사용자가 본인 얼굴을 등록한다 (self=true)
// 2번에서 남의 이름으로 등록하지 못하도록, 계정과 등록 행을 연결하고
// 같은 조직에 한 번만 등록되게 한다.
export async function POST(request) {
  const body = await request.json();
  const { name, guardianContact, embedding, self } = body;

  const auth = self ? await checkMemberApi() : await checkOrgAdminApi();
  if (auth.denied) return NextResponse.json(auth.denied, { status: auth.denied.status });
  const orgId = auth.org.orgId;

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
    if (self) {
      const existing = await getUserByAuthId(orgId, auth.user.id);
      if (existing) {
        return NextResponse.json(
          {
            error: "already_registered",
            message: "이미 얼굴이 등록되어 있습니다. 다시 등록하려면 관리자에게 삭제를 요청하세요.",
          },
          { status: 409 }
        );
      }
    }

    const user = await addUser({
      orgId,
      name,
      guardianContact,
      embedding,
      authUserId: self ? auth.user.id : null,
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const auth = await checkOrgAdminApi();
  if (auth.denied) return NextResponse.json(auth.denied, { status: auth.denied.status });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
  }
  try {
    await deleteUser(auth.org.orgId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
