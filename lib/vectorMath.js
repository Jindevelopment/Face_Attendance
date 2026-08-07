// lib/vectorMath.js
// DeepFace(Facenet512) 임베딩 매칭을 위한 벡터 유틸.
// 임베딩은 512차원 float 배열이며, 매칭은 cosine distance 로 판정한다.
//
// cosine distance = 1 - cos(theta)
//   - 0 에 가까울수록 두 얼굴이 동일 인물
//   - 1 에 가까울수록 서로 다른 인물
// DeepFace Facenet512 기본 verification threshold (cosine) 는 0.30 근처이나,
// 실측 결과에 근거해 0.25 로 좁혔다 (README §4-2):
//   - 폰 화면 재생 공격이 0.3049 로 기본값 0.30 을 겨우 0.0049 차이로 넘겨 차단됐다.
//     그 마진은 화면의 미세 왜곡에 우연히 기댄 것이라 방어선으로 신뢰할 수 없다.
//   - 반면 본인 얼굴 실측 매칭은 0.025 로 기준선의 1/10 수준이었다.
// 두 분포 사이 간격이 넓어 0.25 로 내려도 정상 인식에는 여유가 크다.
export const FACENET512_COSINE_THRESHOLD = 0.25;

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
