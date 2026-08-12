import { NextResponse } from "next/server";
import { matchFace, countUsers, CURRENT_EMBEDDING_DIM } from "@/lib/db";
import { FACENET512_COSINE_THRESHOLD } from "@/lib/vectorMath";
import { signMatchToken } from "@/lib/matchToken";
import { checkMemberApi } from "@/lib/guards";

// 얼굴 매칭을 서버에서 수행한다.
//
// 이전에는 출결 페이지가 /api/users 로 등록자 전원의 embedding 을 받아 브라우저에서
// cosine distance 를 계산했다. 이 라우트는 embedding 한 개를 받아 결과만 돌려주므로,
// 다른 사람의 생체정보가 클라이언트로 나가지 않는다.
//
// 임계값은 서버에서 정한다. 클라이언트가 threshold 를 넘기게 두면 요청을 조작해
// 임계값을 1.0 으로 올리는 것만으로 아무 얼굴이나 통과시킬 수 있다.
//
// 조직은 세션에서 정한다. 요청 본문으로 받으면 남의 조직 사람과 매칭시킬 수 있다.

export const runtime = "nodejs";

export async function POST(request) {
  const auth = await checkMemberApi();
  if (auth.denied) {
    return NextResponse.json(auth.denied, { status: auth.denied.status });
  }
  const orgId = auth.org.orgId;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { embedding } = body || {};
  if (!Array.isArray(embedding) || embedding.length !== CURRENT_EMBEDDING_DIM) {
    return NextResponse.json(
      {
        error: "invalid_embedding",
        message: `embedding 은 ${CURRENT_EMBEDDING_DIM}차원 배열이어야 합니다.`,
      },
      { status: 400 }
    );
  }

  try {
    const total = await countUsers(orgId);
    if (total === 0) {
      return NextResponse.json({ matched: false, reason: "no_users", totalUsers: 0 });
    }

    const best = await matchFace(orgId, embedding, FACENET512_COSINE_THRESHOLD);
    if (!best) {
      return NextResponse.json({
        matched: false,
        reason: "no_match",
        totalUsers: total,
        threshold: FACENET512_COSINE_THRESHOLD,
      });
    }

    const distance = Number(best.distance.toFixed(4));

    // userId 는 응답에 담지 않는다. 대신 서명된 증표를 준다.
    // 브라우저가 userId 를 알면 그것만으로 출석을 위조할 수 있었다 (lib/matchToken.js 참고).
    return NextResponse.json({
      matched: true,
      name: best.name, // 화면에 "OOO님" 을 띄우기 위한 표시용
      distance,
      threshold: FACENET512_COSINE_THRESHOLD,
      totalUsers: total,
      matchToken: signMatchToken({ orgId, userId: best.id, name: best.name, distance }),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "match_failed", message: e.message },
      { status: 500 }
    );
  }
}
