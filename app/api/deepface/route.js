import { NextResponse } from "next/server";

// Next.js -> 로컬 DeepFace(Python/Flask) 서버 프록시.
// 브라우저는 이 라우트만 호출하고, 실제 5005 포트 통신은 서버 사이드에서 이뤄진다.
//
// 요청: { image: "data:image/jpeg;base64,....", mode: "register" | "attendance" }
// 응답: /represent-liveness 커스텀 엔드포인트의 응답을 그대로 전달
//       (embedding, is_real, antispoof_score, facial_area, face_confidence)
//
// 왜 /represent 가 아니고 /represent-liveness 인가:
//   DeepFace 0.0.93 의 /represent 는 anti_spoofing=True 를 넘겨도 성공 응답에
//   is_real / antispoof_score 를 포함하지 않는다. 스푸핑 감지 시엔 400 에러
//   텍스트만 반환. deepface-api/run.py 가 extract_faces + represent(skip) 를
//   조합한 /represent-liveness 를 노출한다.

const DEEPFACE_URL =
  process.env.DEEPFACE_API_URL || "http://localhost:5005/represent-liveness";

// 얼굴 인식 서버를 인터넷에 올리면 주소를 아는 누구나 호출할 수 있다.
// 서버가 X-API-Key 를 요구하도록 해두고(deepface-api/run.py), 여기서 그 키를 보낸다.
// 로컬 개발에서는 양쪽 다 없으면 그냥 통과한다.
const DEEPFACE_API_KEY = process.env.DEEPFACE_API_KEY;

// 등록/출결 모두 동일한 파이프라인 (임베딩 + anti-spoofing) 을 통과시킨다.
// mode 는 향후 파라미터 분화 여지를 위해 남겨둔다 (예: 등록은 라이브니스만 완화).
const MODEL_NAME = "Facenet512";
// opencv Haar cascade 는 셀카 각도/조명에 취약해 실 사용에서 미검출 사례가 잦다.
// retinaface 는 정확도가 훨씬 높고, 첫 로드 후엔 캐시되어 추론 지연도 수용 가능.
const DETECTOR_BACKEND = "retinaface";

export const runtime = "nodejs";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { image, mode } = body || {};
  if (!image || typeof image !== "string") {
    return NextResponse.json(
      { error: "image(base64) 가 필요합니다." },
      { status: 400 }
    );
  }
  if (mode !== "register" && mode !== "attendance") {
    return NextResponse.json(
      { error: "mode 는 register|attendance 중 하나여야 합니다." },
      { status: 400 }
    );
  }

  // /represent-liveness 는 내부적으로 extract_faces(anti_spoofing=True) 를 항상 호출한다.
  // 즉 anti_spoofing 파라미터는 별도로 넘기지 않아도 라이브니스 판정이 포함된다.
  const payload = {
    img: image,
    model_name: MODEL_NAME,
    detector_backend: DETECTOR_BACKEND,
    enforce_detection: true,
    align: true,
  };

  // DeepFace 추론이 오래 걸릴 수 있으나 무한 대기하면 브라우저 UX 가 죽어버리므로
  // 60초에서 강제 중단하고 504 로 되돌린다.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  let upstream;
  try {
    upstream = await fetch(DEEPFACE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(DEEPFACE_API_KEY ? { "X-API-Key": DEEPFACE_API_KEY } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    return classifyFetchError(e);
  }
  clearTimeout(timeout);

  const text = await upstream.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      {
        error: "deepface_invalid_response",
        message:
          "DeepFace 서버가 JSON 이 아닌 응답을 반환했습니다. 서버 로그를 확인해주세요.",
        raw: text?.slice(0, 500),
      },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    return NextResponse.json(
      {
        error: "deepface_error",
        message:
          typeof data?.error === "string"
            ? data.error
            : `DeepFace 서버가 ${upstream.status} 로 응답했습니다.`,
        detail: data,
      },
      { status: upstream.status }
    );
  }

  // /represent-liveness 는 최상위에 embedding / is_real / antispoof_score 를 반환한다.
  if (!Array.isArray(data?.embedding) || data.embedding.length === 0) {
    return NextResponse.json(
      {
        error: "no_face_detected",
        message:
          data?.message ||
          "DeepFace 가 얼굴을 찾지 못했습니다. 조명/각도를 조정하고 다시 시도해주세요.",
        raw: data,
      },
      { status: 422 }
    );
  }

  return NextResponse.json({
    mode,
    embedding: data.embedding,
    isReal: data.is_real ?? null,
    antispoofScore: data.antispoof_score ?? null,
    faceConfidence: data.face_confidence ?? null,
    facialArea: data.facial_area ?? null,
  });
}

// Undici(Node fetch) 에러를 사용자용 메시지로 분류.
// - ECONNREFUSED: 서버 꺼져있음
// - ENOTFOUND / EAI_AGAIN: DNS/호스트 문제 (원격 배포 시)
// - AbortError: 타임아웃
// - 기타: 네트워크 오류
function classifyFetchError(e) {
  const cause = e?.cause;
  const causeCode = cause?.code || cause?.errno;
  const name = e?.name;

  if (name === "AbortError") {
    return NextResponse.json(
      {
        error: "deepface_timeout",
        message:
          "DeepFace 서버 응답이 60초 이내에 오지 않았습니다. 서버가 과부하이거나 모델 로딩이 지연 중입니다.",
      },
      { status: 504 }
    );
  }

  if (causeCode === "ECONNREFUSED") {
    return NextResponse.json(
      {
        error: "deepface_server_down",
        message:
          "DeepFace 서버(localhost:5005) 가 응답하지 않습니다. deepface-api/ 에서 `python run.py` 가 실행 중인지 확인해주세요.",
        detail: `${cause?.address ?? "localhost"}:${cause?.port ?? 5005} 연결 거부`,
      },
      { status: 502 }
    );
  }

  if (causeCode === "ENOTFOUND" || causeCode === "EAI_AGAIN") {
    return NextResponse.json(
      {
        error: "deepface_dns_error",
        message: `DeepFace 서버 호스트를 찾을 수 없습니다 (${causeCode}). DEEPFACE_API_URL 설정을 확인해주세요.`,
      },
      { status: 502 }
    );
  }

  return NextResponse.json(
    {
      error: "deepface_server_unreachable",
      message:
        "DeepFace 서버와 통신 중 오류가 발생했습니다. 서버 상태와 네트워크를 확인해주세요.",
      detail: e?.message || String(e),
      code: causeCode || null,
    },
    { status: 502 }
  );
}
