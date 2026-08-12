// 매칭 통과 증표(match token).
//
// 문제:
//   /api/match 가 성공 시 userId 를 브라우저에 돌려주고, POST /api/attendance 가
//   그 userId 를 그대로 믿고 출석을 기록했다. 한 번이라도 성공한 사람은 개발자도구에서
//   자기 userId 를 확인한 뒤, 카메라 앞에 서지 않고 curl 한 줄로 출석을 찍을 수 있었다.
//
// 해결:
//   매칭에 성공했을 때만 서버가 { userId, name, distance } 에 HMAC 서명을 붙여 발급한다.
//   /api/attendance 는 이 서명을 검증하고, 사용자 정보를 "토큰에서" 꺼낸다.
//   요청 본문의 userId 는 더 이상 쳐다보지 않는다. 서명을 위조하려면 비밀키가 필요하다.
//
// 재사용(replay) 에 대하여:
//   토큰은 상태를 두지 않으므로 TTL 안에서는 같은 토큰을 다시 쓸 수 있다. 다만
//   TTL(2분) 이 출결 중복 방지 창(5분) 보다 짧아, 재사용해도 두 번째부터는 DUPLICATE 로
//   막힌다. 즉 성공 기록을 부풀리지 못한다. 이 관계가 깨지지 않도록 아래 상수와
//   app/api/attendance/route.js 의 hasRecentAttendance(userId, 5) 를 함께 봐야 한다.

import crypto from "node:crypto";

// 토큰 유효 시간. 매칭 직후 곧바로 쓰이므로 짧게 잡는다.
// 위 주석대로 출결 중복 방지 창(5분) 보다 반드시 짧아야 한다.
export const MATCH_TOKEN_TTL_SECONDS = 120;

function getSecret() {
  const secret = process.env.ATTENDANCE_TOKEN_SECRET;
  // 기본값을 두지 않는다. 기본값이 있으면 배포 후 설정을 잊었을 때
  // "동작은 하는데 아무나 서명할 수 있는" 상태가 조용히 유지된다.
  if (!secret || secret.length < 32) {
    throw new Error(
      "ATTENDANCE_TOKEN_SECRET 이 없거나 너무 짧습니다(32자 이상). .env.local 을 확인하세요."
    );
  }
  return secret;
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

/** 매칭 결과에 서명해 토큰 문자열을 만든다. */
export function signMatchToken({ orgId, userId, name, distance }) {
  const payload = {
    // 조직도 서명에 포함한다. 없으면 A 조직에서 받은 증표로 B 조직에 출석을
    // 기록하는 경로가 열린다.
    orgId,
    userId,
    name,
    // 거리도 서명에 포함한다. 로그에 남는 값이 클라이언트에서 조작되지 않도록.
    distance,
    exp: Math.floor(Date.now() / 1000) + MATCH_TOKEN_TTL_SECONDS,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/**
 * 토큰을 검증한다.
 * @returns {{ok: true, payload: object} | {ok: false, reason: string}}
 */
export function verifyMatchToken(token) {
  if (typeof token !== "string" || !token.includes(".")) {
    return { ok: false, reason: "malformed" };
  }
  const [body, sig] = token.split(".", 2);

  let expected;
  try {
    expected = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  } catch (e) {
    // 비밀키 미설정. 통과시키지 않는다.
    return { ok: false, reason: "misconfigured", message: e.message };
  }

  // 길이가 다르면 timingSafeEqual 이 예외를 던지므로 먼저 거른다.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }
  if (!payload.userId || !payload.orgId) {
    return { ok: false, reason: "malformed" };
  }

  return { ok: true, payload };
}
