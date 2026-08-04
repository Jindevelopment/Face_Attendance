// lib/vectorMath.js
// DeepFace(Facenet512) 임베딩 매칭을 위한 벡터 유틸.
// 임베딩은 512차원 float 배열이며, 매칭은 cosine distance 로 판정한다.
//
// cosine distance = 1 - cos(theta)
//   - 0 에 가까울수록 두 얼굴이 동일 인물
//   - 1 에 가까울수록 서로 다른 인물
// DeepFace Facenet512 기본 verification threshold (cosine) 는 0.30 근처.
// 서비스 목적에 따라 재보정 필요.

export const FACENET512_COSINE_THRESHOLD = 0.3;

export function cosineDistance(a, b) {
  if (!a || !b || a.length !== b.length) {
    throw new Error(
      `cosineDistance: 길이가 다릅니다 (a=${a?.length}, b=${b?.length}).`
    );
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i];
    const bv = b[i];
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 1;
  const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  // 부동소수점 오차로 아주 살짝 범위를 벗어날 수 있어 clamp
  const clamped = Math.max(-1, Math.min(1, sim));
  return 1 - clamped;
}
