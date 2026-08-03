# FaceGate — 위조 판별 얼굴 인식 출결 관리 시스템 (MVP)

Next.js(App Router) 기반으로 구현한 실행 가능한 프로토타입입니다.
얼굴 매칭 전에 **① 라이브니스(실물) 판별 → ② AI 생성(딥페이크) 이미지 판별**을 먼저 통과해야
출결이 기록되는 구조로 설계되어 있습니다.

---

## 1. 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000` 접속 (카메라 권한 허용 필요, **HTTPS 또는 localhost**에서만 카메라 API가 동작합니다).

1. `/register` — 얼굴 등록 (이름 입력 → 얼굴 스캔 → 등록)
2. `/attendance` — 출결 체크 (스캔 → 위조 판별 → 매칭 → 기록)
3. `/dashboard` — 등록 사용자 / 출결 로그 / 이상 탐지 로그 확인

데이터는 `data/db.json` 파일에 저장됩니다 (데모용 파일 기반 저장소).

---

## 2. 아키텍처

```
[FaceCapture 컴포넌트 (클라이언트)]
  - face-api.js: TinyFaceDetector + FaceLandmark68 + FaceRecognitionNet
  - 약 1.5초간 14프레임 연속 캡처
       ├─ EAR(눈 종횡비) 시퀀스 → 눈 깜빡임 감지 (lib/clientVision.js)
       ├─ 랜드마크 프레임간 미세 움직임(jitter) 계산
       └─ 마지막 프레임 얼굴 영역 crop → 주파수/텍스처 기반 합성 이미지 의심 점수 산출
  ▼
[판별 결과]
  - livenessPassed = 눈깜빡임 감지 OR jitter > 임계값
  - syntheticSuspect = 합성 의심 점수 >= 임계값
  ▼ (라이브니스 실패 or 합성 의심 시 즉시 거부 → /api/attendance 에 REJECTED_SPOOF로 로깅)
[얼굴 매칭] (라이브니스+합성판별 통과 시에만 수행)
  - /api/users 에서 등록 사용자 목록 조회
  - faceapi.euclideanDistance 로 최소 거리 사용자 탐색 (threshold 0.5)
  ▼
[출결 기록] /api/attendance (POST, result: SUCCESS)
  - 5분 이내 중복 출결 방지
  ▼
[대시보드] /dashboard — 서버 컴포넌트에서 data/db.json 직접 조회
```

---

## 3. ⚠️ 반드시 읽어주세요: 위조 판별 로직의 한계

이 프로젝트의 위조 판별 모듈은 **동작하는 파이프라인 구조를 보여주기 위한 MVP 휴리스틱**이며,
프로덕션 수준의 딥페이크 탐지 성능을 보장하지 않습니다.

| 모듈 | 현재 구현 방식 | 프로덕션 적용 시 권장 사항 |
|---|---|---|
| 라이브니스 판별 | EAR 기반 눈 깜빡임 감지 + 랜드마크 미세 움직임(jitter) | 적외선/깊이 카메라 기반 3D 라이브니스, 또는 검증된 상용 SDK(FaceTec, iProov 등) 도입 |
| AI 생성 이미지 판별 | 라플라시안 고주파 에너지 + 블록 텍스처 균일도 기반 휴리스틱 (`lib/clientVision.js`의 `computeSyntheticScore`) | FaceForensics++, DFDC 등으로 학습된 CNN 기반 딥페이크 탐지 모델 또는 전용 API(예: Sensity, Reality Defender 등)로 교체 |
| 임계값(threshold) | 경험적으로 설정된 값 (재보정 안 됨) | 실제 등록자/공격 샘플 데이터로 ROC 커브 분석 후 재설정 |

**즉, 현재 코드는 "위조 판별을 얼굴 매칭보다 먼저 수행하는 아키텍처"를 실제로 동작하게 만든 것이며,
판별 알고리즘 자체는 실서비스 투입 전 반드시 검증된 모델/서비스로 교체해야 합니다.**

---

## 4. 프로덕션 전환 시 체크리스트

- [ ] `data/db.json` → PostgreSQL/MySQL 등 실제 DB로 교체 (Prisma 권장)
- [ ] 얼굴 특징 벡터(descriptor) 암호화 저장 (생체정보는 개인정보보호법상 민감정보)
- [ ] HTTPS 배포 (카메라 API 필수 요건)
- [ ] 딥페이크 탐지 모델을 학습된 모델/전용 API로 교체
- [ ] 카카오 알림톡 등 실제 알림 발송 연동 (`/api/attendance` SUCCESS 시점에 훅 추가)
- [ ] 얼굴 데이터 수집 동의 절차(UI) 및 보관기간 정책 반영
- [ ] 관리자 인증(로그인) 추가 — 현재 `/dashboard`는 인증 없이 접근 가능
- [ ] 위조 판별 임계값 실측 데이터 기반 재보정

---

## 5. 폴더 구조

```
app/
  page.js               홈
  register/page.js      얼굴 등록 페이지
  attendance/page.js    출결 체크 페이지 (위조판별 + 매칭 로직)
  dashboard/page.js     관리자 대시보드 (서버 컴포넌트)
  api/users/route.js    사용자 등록/조회/삭제 API
  api/attendance/route.js  출결 기록 / 이상탐지 로그 API
components/
  FaceCapture.js         카메라 + face-api.js 캡처 파이프라인 (핵심 컴포넌트)
lib/
  db.js                  파일 기반 저장소 (users, attendanceLogs, antiSpoofLogs)
  clientVision.js         EAR/jitter/synthetic score 계산 (위조 판별 휴리스틱)
public/models/            face-api.js 사전학습 가중치 (tiny_face_detector, landmark68, recognition)
data/db.json               데모 데이터 저장 파일
```

기획 배경 및 요구사항 명세는 별도로 전달된 `얼굴인식_출결관리시스템_기획_요구사항명세서.md`를 참고하세요.
