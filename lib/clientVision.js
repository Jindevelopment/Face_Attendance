// lib/clientVision.js
// 브라우저(클라이언트)에서 실행되는 위조 판별 유틸리티.
//
// 중요: 아래 "AI 생성 이미지 판별(syntheticScore)"은 실제 서비스 수준의 딥페이크 탐지기가 아니라,
// 주파수/텍스처 특성을 이용한 경량 휴리스틱입니다. 실제 서비스 적용 전에는
// FaceForensics++ 등으로 학습된 CNN 기반 딥페이크 탐지 모델(또는 전용 API)로 교체가 필요합니다.
// 이 코드는 "판별 파이프라인의 자리(architecture placeholder)"를 실제로 동작하는 형태로 제공하기 위한 것입니다.

// face-api.js 68 랜드마크 기준 눈 인덱스
const LEFT_EYE = [36, 37, 38, 39, 40, 41];
const RIGHT_EYE = [42, 43, 44, 45, 46, 47];

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// EAR(Eye Aspect Ratio): 눈이 감기면 값이 작아짐
function eyeAspectRatio(points, idx) {
  const p = idx.map((i) => points[i]);
  const vertical1 = dist(p[1], p[5]);
  const vertical2 = dist(p[2], p[4]);
  const horizontal = dist(p[0], p[3]);
  if (horizontal === 0) return 0;
  return (vertical1 + vertical2) / (2.0 * horizontal);
}

export function computeEAR(landmarkPositions) {
  const left = eyeAspectRatio(landmarkPositions, LEFT_EYE);
  const right = eyeAspectRatio(landmarkPositions, RIGHT_EYE);
  return (left + right) / 2;
}

// 여러 프레임에 걸친 EAR 시퀀스에서 "깜빡임" 이벤트가 있었는지 판별
export function detectBlink(earSequence, { blinkThreshold = 0.23, minFrames = 1 } = {}) {
  let below = 0;
  let sawDip = false;
  for (const ear of earSequence) {
    if (ear < blinkThreshold) {
      below += 1;
      if (below >= minFrames) sawDip = true;
    } else {
      below = 0;
    }
  }
  return sawDip;
}

// 랜드마크 좌표의 프레임 간 미세 움직임 분산.
// 정지 사진/인쇄물은 값이 거의 0에 수렴, 실제 얼굴은 자연스러운 미세 움직임이 있음.
export function landmarkJitterScore(landmarkFrames) {
  if (landmarkFrames.length < 2) return 0;
  const noseIdx = 30; // 코 끝
  const pts = landmarkFrames.map((f) => f[noseIdx]);
  const meanX = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const meanY = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const variance =
    pts.reduce((s, p) => s + (p.x - meanX) ** 2 + (p.y - meanY) ** 2, 0) / pts.length;
  return Math.sqrt(variance);
}

// 얼굴 영역 캔버스에서 그레이스케일 값 추출
function toGrayscale(imageData) {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return { gray, width, height };
}

// 3x3 라플라시안 컨볼루션 (고주파 에지 응답)
function laplacianResponse(gray, width, height) {
  const kernel = [0, 1, 0, 1, -4, 1, 0, 1, 0];
  const out = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      let k = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          sum += gray[(y + ky) * width + (x + kx)] * kernel[k];
          k++;
        }
      }
      out[y * width + x] = sum;
    }
  }
  return out;
}

function mean(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function variance(arr, m) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += (arr[i] - m) ** 2;
  return s / arr.length;
}

// 블록 단위로 나누어 각 블록의 분산(텍스처 에너지)을 계산 -> 분산들의 균일도를 측정.
// 생성 모델(업샘플링 기반)은 국소 텍스처 에너지가 부자연스럽게 균일해지는 경향이 있다는
// 연구 관찰(스펙트럴 아티팩트)에 착안한 경량 프록시 지표.
function blockUniformity(gray, width, height, blockSize = 8) {
  const blockVariances = [];
  for (let by = 0; by + blockSize <= height; by += blockSize) {
    for (let bx = 0; bx + blockSize <= width; bx += blockSize) {
      const block = [];
      for (let y = 0; y < blockSize; y++) {
        for (let x = 0; x < blockSize; x++) {
          block.push(gray[(by + y) * width + (bx + x)]);
        }
      }
      const m = mean(block);
      blockVariances.push(variance(block, m));
    }
  }
  if (blockVariances.length === 0) return { uniformity: 0, meanEnergy: 0 };
  const m = mean(blockVariances);
  const v = variance(blockVariances, m);
  // 분산들의 변동계수(CV)가 낮을수록(=너무 균일할수록) 의심스러움
  const cv = m > 0 ? Math.sqrt(v) / m : 0;
  return { uniformity: cv, meanEnergy: m };
}

// imageData(얼굴 영역 crop)를 받아 0~100 사이의 "합성 이미지 의심 점수" 산출
// 점수가 높을수록 AI 생성/합성 가능성이 높다고 판단.
export function computeSyntheticScore(imageData) {
  const { gray, width, height } = toGrayscale(imageData);
  const lap = laplacianResponse(gray, width, height);
  const lapMean = mean(lap);
  const lapVar = variance(lap, lapMean); // 고주파 에너지 (너무 낮으면 과도하게 매끈 = 의심)
  const { uniformity, meanEnergy } = blockUniformity(gray, width, height);

  // 경험적 정규화 (데모용 임계값 — 실제 배포 전 자체 데이터셋으로 재보정 필요)
  const lowFreqSuspicion = clamp01(1 - lapVar / 800); // 고주파 에너지가 낮을수록 의심 증가
  const uniformitySuspicion = clamp01(1 - uniformity / 0.6); // 텍스처가 너무 균일할수록 의심 증가

  const rawScore = lowFreqSuspicion * 0.5 + uniformitySuspicion * 0.5;
  return {
    score: Math.round(clamp01(rawScore) * 100),
    detail: { lapVar, uniformity, meanEnergy },
  };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}
