// Node 단독 실행용 회귀 테스트.
//   node lib/__tests__/vectorMath.test.mjs
//
// lib/vectorMath.js 는 Next.js 컨텍스트에서만 ESM 으로 취급되므로,
// data: URL 을 통해 소스를 로드해 ESM 모듈로 임포트한다 (별도 test 러너 불필요).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../vectorMath.js", import.meta.url), "utf8");
const mod = await import(
  "data:text/javascript;charset=utf-8;base64," +
    Buffer.from(src).toString("base64")
);
const { cosineDistance, FACENET512_COSINE_THRESHOLD } = mod;

// DeepFace verification.py 의 find_cosine_distance 를 그대로 재현.
//   distance = 1 - dot(a,b) / ( sqrt(Σa²) * sqrt(Σb²) )
function referenceCosineDistance(a, b) {
  let dot = 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    sa += a[i] * a[i];
    sb += b[i] * b[i];
  }
  return 1 - dot / (Math.sqrt(sa) * Math.sqrt(sb));
}

let failed = 0;
function testCase(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`  FAIL ${name}\n       ${e.message}`);
  }
}

console.log("cosineDistance ↔ DeepFace 공식 회귀 테스트");

testCase("동일 벡터는 거리 0", () => {
  const v = [1, 2, 3, 4, 5];
  assert.equal(cosineDistance(v, v), 0);
});

testCase("직교 벡터(cos=0)는 거리 1", () => {
  const a = [1, 0, 0, 0];
  const b = [0, 1, 0, 0];
  assert.equal(cosineDistance(a, b), 1);
});

testCase("반대 방향(cos=-1)은 거리 2", () => {
  const a = [1, 2, 3];
  const b = [-1, -2, -3];
  assert.equal(cosineDistance(a, b), 2);
});

testCase("임의 짧은 벡터: DeepFace 참조식과 동일", () => {
  const a = [0.1, -0.3, 0.5, 0.7, -0.2];
  const b = [0.4, 0.1, -0.2, 0.6, 0.3];
  const got = cosineDistance(a, b);
  const expected = referenceCosineDistance(a, b);
  // 1e-12 이내 일치 (부동소수 정확도)
  assert.ok(Math.abs(got - expected) < 1e-12, `got=${got} expected=${expected}`);
});

testCase("512차원 pseudo-random 임베딩: DeepFace 참조식과 동일", () => {
  // 결정적 pseudo-random 시퀀스 (테스트 재현성)
  function seededRand(seed) {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }
  const r1 = seededRand(42);
  const r2 = seededRand(1337);
  const a = Array.from({ length: 512 }, () => r1() * 2 - 1);
  const b = Array.from({ length: 512 }, () => r2() * 2 - 1);
  const got = cosineDistance(a, b);
  const expected = referenceCosineDistance(a, b);
  assert.ok(Math.abs(got - expected) < 1e-10, `got=${got} expected=${expected}`);
});

testCase("길이 불일치 시 throw", () => {
  assert.throws(() => cosineDistance([1, 2, 3], [1, 2]), /길이가 다릅니다/);
});

testCase("영벡터 방어(NaN 대신 1 반환)", () => {
  assert.equal(cosineDistance([0, 0, 0], [1, 2, 3]), 1);
});

testCase("FACENET512_COSINE_THRESHOLD 값(DeepFace 기본값 0.30)", () => {
  assert.equal(FACENET512_COSINE_THRESHOLD, 0.3);
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log(`\nAll tests passed.`);
