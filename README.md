# FaceGate — 위조 판별 얼굴 인식 출결 관리 시스템 (MVP)

Next.js(App Router) + Python(DeepFace/Flask) 하이브리드 프로토타입입니다.
얼굴 매칭 전에 **① 클라이언트 1차 방어선(눈깜빡임/합성 휴리스틱) → ② 서버 DeepFace(MiniFASNet) 라이브니스**
를 모두 통과해야 출결이 기록됩니다.

---

## 1. 실행 방법

### 1-A. DeepFace 서버 (Python, 포트 5005)

먼저 별도 터미널에서 DeepFace API 서버를 띄운다.

```powershell
cd deepface-api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install torch==2.4.1 --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
python run.py
```

자세한 실행 안내와 헬스체크 방법은 [`deepface-api/README.md`](deepface-api/README.md) 참고.

### 1-B. Next.js 앱 (포트 3000)

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000` 접속 (카메라 권한 허용 필요,
**HTTPS 또는 localhost** 에서만 카메라 API 가 동작합니다).

1. `/register` — 얼굴 등록 (이름 입력 → 얼굴 스캔 → DeepFace 임베딩 저장)
2. `/attendance` — 출결 체크 (스캔 → 클라이언트 검증 → DeepFace 검증 → 매칭 → 기록)
3. `/dashboard` — 등록 사용자 / 출결 로그 / 이상 탐지 로그 확인

Next.js 는 브라우저가 직접 5005 포트를 호출하지 않도록 `app/api/deepface/route.js`
프록시 라우트를 통해 DeepFace 서버와 통신한다.

데이터는 `data/db.json` 파일에 저장됩니다 (데모용 파일 기반 저장소).

---

## 2. 아키텍처

```
[FaceCapture 컴포넌트 (브라우저)]
  - face-api.js: TinyFaceDetector + FaceLandmark68 + FaceRecognitionNet
  - 약 1.5초간 14프레임 연속 캡처
       ├─ EAR(눈 종횡비) 시퀀스 → 눈 깜빡임 감지 (lib/clientVision.js)
       ├─ 랜드마크 프레임간 미세 움직임(jitter) 계산
       ├─ 마지막 프레임 얼굴 영역 crop → 주파수/텍스처 기반 합성 이미지 의심 점수
       └─ 마지막 프레임 원본 JPEG(base64) — 서버 전송용
  ▼
[클라이언트 1차 방어선]
  - livenessPassed = 눈깜빡임 감지 OR jitter > 임계값
  - syntheticSuspect = 합성 의심 점수 >= 임계값
  ▼ (실패 시 즉시 REJECTED_SPOOF 로 종료)
[서버 2차 검증]  POST /api/deepface  →  DeepFace REST (localhost:5005 /represent)
  - anti_spoofing=true 로 MiniFASNet 실물 판정 → is_real, antispoof_score
  - Facenet512 로 512차원 embedding 추출
  ▼ (is_real=false 면 REJECTED_SPOOF)
[얼굴 매칭]
  - /api/users 에서 등록 사용자 목록 조회
  - cosineDistance(embedding, u.embedding) 최소값 사용자 탐색
  - threshold 0.30 (Facenet512 기본값, 재보정 필요)
  ▼
[출결 기록] /api/attendance (POST, result: SUCCESS)
  - 5분 이내 중복 출결 방지
  ▼
[대시보드] /dashboard — 서버 컴포넌트에서 data/db.json 직접 조회
```

---

## 3. ⚠️ 위조 판별 로직의 한계와 역할 구분

| 계층 | 모듈 | 방식 |
|---|---|---|
| 클라이언트 1차 | `lib/clientVision.js` (EAR/jitter/synthetic score) | 인쇄 사진·화면 재생 같은 얕은 공격을 즉시 걸러내는 경량 휴리스틱 |
| 서버 2차 | DeepFace `anti_spoofing=true` (MiniFASNet) | 검증된 학습 모델 기반 최종 판정 |
| 얼굴 매칭 | DeepFace Facenet512 (512-d) + cosine distance | 서버에서 임베딩 추출, 서버 라우트에서 매칭 |

**클라이언트 검증은 삭제하지 않고 유지한다** — 네트워크 왕복 전에 명백한 공격을 조기 차단해
DeepFace 서버 부하와 응답 지연을 줄이는 필터 역할.

**임계값(threshold) 재보정**: `MATCH_DISTANCE_THRESHOLD`(0.30), `JITTER_THRESHOLD`(0.35),
`SYNTHETIC_SUSPECT_THRESHOLD`(60) 는 모두 경험값이므로 실측 데이터로 ROC 커브 분석 후
서비스 환경에 맞게 재조정할 것.

---

## 4. 실효성 검증 결과 (2026-08-04, 폰 화면 재생 공격 6회)

**테스트 방법**: 스마트폰 화면에 등록자 셀카를 띄우고 카메라 앞에 대는 replay attack 을
조건을 바꿔가며 6회 반복. 로그는 `scripts/analyze-spoof-logs.js --all` 로 재확인 가능.

| # | 조건 | is_real (DeepFace/MiniFASNet) | antispoof_score | 최종 판정 |
|---|---|---|---|---|
| 1 | 평소 밝기 + 정면 | **true (오판)** | 0.9737 | REJECTED_NO_MATCH (cos 거리 0.3049 로 우연히 걸림) |
| 2 | 최대 밝기 + 정면 | false | 0.8516 | REJECTED_SPOOF |
| 3 | 최소 밝기 | — (클라이언트 얼굴 인식 실패, 서버 미도달) | — | 로그 없음 |
| 4 | 평소 밝기 + 15~20° 기울임 | false | 0.9936 | REJECTED_SPOOF |
| 5 | 낮은 밝기 + 정면 | false | 1.0000 | REJECTED_SPOOF |
| 6 | 평소 밝기 + 정면 (1번 재현) | false | 0.9990 | REJECTED_SPOOF |

> 참고: 원본 antiSpoofLogs 에는 위 6개 시도 사이(test #3 실패 직후, test #4 직전)에
> `antispoof 0.9835, REJECTED_SPOOF` 로그가 1건 더 남아 있으나 6가지 조건 어느 것에도
> 대응되지 않는 재시도/전환 시점 로그로 판단되어 별도 행으로 옮기지 않는다.
> 이 값을 포함해도 6회 요약(1회 오판)이 그대로 유지된다는 점만 밝혀둔다.

**결론**
- **6회 중 1회(약 17%) MiniFASNet 이 폰 화면 재생을 실물로 오판.** 실용상 낮지 않은 우회율.
- **동일 조건(1번↔6번)에서도 결과가 갈렸음** → 밝기·각도 같은 명시적 변수와 뚜렷한 상관관계가
  없고, 확률적/불안정한 실패로 판단된다. 특정 조건을 피하는 것으로 해결되지 않음.
- **1번이 최종 차단된 것은 anti-spoofing 이 아니라 cosine distance 매칭(0.3049 > 0.30 임계값)
  덕분**이었으며, 그 마진이 겨우 0.0049 라 폰 화면의 미세한 왜곡에 우연히 기댄 결과다.
  임베딩이 조금만 덜 흐트러졌다면 그대로 통과했을 것 → **다층 방어의 우연한 커버리지이지
  근본적 방어선이 아님.**

### 4-1. 별개로 발견된 설계상 허점: jitter 라이브니스의 역설

`lib/clientVision.js` 의 jitter 휴리스틱은 "정지된 사진은 흔들리지 않는다" 는 전제로
프레임간 랜드마크 미세 움직임을 라이브니스 근거로 삼는다. 그런데 실측에서는
정반대의 경향이 관측됐다:

| 시나리오 | jitterScore |
|---|---|
| 실제 얼굴 등록 스캔 (사용자 손이 아니라 얼굴 자체가 카메라 앞에 있음) | **2.458** |
| 폰 화면을 손으로 들고 스캔 (사진은 정지, 하지만 손이 떨림) | **13.947** |

즉 **사진을 손으로 들고 있으면 손떨림이 프레임 전체를 흔들어 랜드마크가 오히려 더 크게
움직인다.** jitter 만으로는 replay 를 걸러내기 어렵고, 오히려 `jitter > threshold` 조건이
공격을 도와주는 방향으로 작용할 수 있다. 별도 지표(고정 카메라 가정 하의 얼굴 영역 내부
상대 움직임, 광원 변화 감지 등) 도입 없이는 이 휴리스틱은 라이브니스 근거로 부적절.

### 4-2. 후속 대응 방향 (요약)

1. **cosine distance 임계값을 0.30 → 0.25 정도로 좁혀 우회 마진을 줄인다** (오탐 트레이드오프
   재조정 필요).
2. **능동 챌린지(active liveness challenge) 도입** — 아래 §5 참고 (2026-08-04 구현 완료).
   MiniFASNet 은 정적 프레임 하나만 보므로, 프레임 시퀀스에서 사용자가 지시대로 반응했는지를
   검증하는 챌린지가 확률적 오판을 구조적으로 방어한다.
3. **jitter 지표를 라이브니스 근거에서 제외**하고, 대신 눈깜빡임(현재 미포착 상태) 필수화
   또는 광원 변화 감지 등 새 지표로 교체.

---

## 5. 능동 챌린지(active liveness challenge) — 구현 완료 (2026-08-04)

MiniFASNet 의 확률적 오판을 구조적으로 방어하기 위해, 정적 프레임 한 장이 아닌 **사용자
지시 반응을 검증하는 동적 챌린지**를 스캔 파이프라인 최상단에 추가했다. face-api.js 가
이미 반환하는 68개 랜드마크만으로 클라이언트 단독 구현 (새 모델·백엔드 변경 없음).

### 5-1. yaw(좌우 회전) 추정 (`lib/clientVision.js` — `computeYawRatio`)

FaceLandmark68 좌표에서 세 점의 x 값을 사용:

- `landmarks[30]` — 코 끝
- `landmarks[0]` — 얼굴 좌측 윤곽 (raw 프레임 기준 왼쪽 = 사용자 본인의 오른쪽 얼굴)
- `landmarks[16]` — 얼굴 우측 윤곽 (raw 프레임 기준 오른쪽 = 사용자 본인의 왼쪽 얼굴)

```
yawRatio = (noseTipX - leftJawX) / (rightJawX - leftJawX) - 0.5
// yawRatio ≈ 0     → 정면
// yawRatio > +0.15 → 사용자 본인 기준 왼쪽 회전
// yawRatio < -0.15 → 사용자 본인 기준 오른쪽 회전
```

**좌표 기준 주의**: 비디오 요소에는 `transform: scaleX(-1)` 미러가 걸려 있지만 이는
표시용 CSS 이고, face-api.js 는 raw 비디오 프레임으로 랜드마크를 계산한다. 따라서
사용자가 본인 기준 왼쪽으로 고개를 돌리면 raw 프레임에서 코가 오른쪽(x 증가)으로
이동하여 yawRatio 부호가 양수가 된다.

### 5-2. 실제 UX 흐름 (`components/FaceCapture.js` — `runScan` → `runChallenge`)

매 스캔 시도마다 아래 4개 시퀀스 중 하나를 무작위로 선택 (`pickChallengeSequence`):

```
["left", "right"], ["right", "left"], ["left", "left"], ["right", "right"]
```

같은 방향이 연속되는 조합도 포함시켜, 공격자가 "좌→우 고정" 같은 정해진 각본으로
사진 두 장을 준비했을 때조차 통과하지 못하도록 한다.

```
1. 스캔 버튼 클릭
2. (랜덤 시퀀스 결정)
3. "고개를 [X]으로 살짝 돌려주세요" — 최대 5초 내 yawRatio 부호·크기 조건 도달
4. "정면으로 돌아온 뒤 (다시/이번엔) [Y]으로 돌려주세요"
     ─ 2단계부터는 `requireReset=true`. 먼저 |yawRatio| < 0.05 를 관측한 뒤에만
       목표 방향 도달 검사를 시작한다. 이전 단계의 yaw 잔존값으로 즉시 통과되는
       꼼수를 차단(특히 같은 방향 연속 시퀀스에서 필수).
5. 통과 시 기존 SCAN_FRAME_COUNT(14) 프레임 캡처 → 라이브니스/합성/디스크립터 추출
6. 파이프라인은 그대로: 클라이언트 지표 + DeepFace 서버(Facenet512 + MiniFASNet)
```

챌린지 실패 시 `setError()` 로 재시도 안내를 노출하고 함수를 즉시 종료 — **DeepFace 서버
호출은 발생하지 않는다** (라운드트립 절감). 성공한 스캔의 `challengeSequence` 는
`attendanceLogs` / `antiSpoofLogs` 에 배열 그대로 저장되어 사후 분석 가능.

### 5-3. 이 조치의 정확한 성격: "저비용 완화책"

**해결한 것 (좁게)**: 공격자가 "이 앱은 좌→우 순서로 지시한다"는 사전 지식으로 좌·우 사진
두 장을 정해진 타이밍에 순차로 들이대는 "정해진 각본" 공격. 4가지 시퀀스 랜덤화로
사전 준비된 각본이 그대로 맞을 확률이 25% 로 떨어진다 (실질적으로는 같은 방향 연속
시퀀스가 나올 경우 리셋 관측이 요구되어 사진 교체 타이밍 난이도가 더 올라감).

**해결하지 못한 것 (넓게)**:

- **2D 랜드마크 기반 yaw 추정 자체의 근본 한계**: 카메라가 평면 이미지(모니터/폰 화면)를
  물리적으로 좌우로 기울여 촬영한 경우와, 실제 3D 얼굴이 좌우로 회전한 경우를 랜드마크
  x 좌표 비율만으로는 구분할 수 없다. 화면 자체를 기울이는 replay 는 여전히 통과 가능.
- **미리 녹화된 좌우 회전 영상 replay**: 지시 문구가 예측 가능한 시점에 뜨는 순간
  그에 맞춰 재생하면 통과 가능. 진짜 방어는 지시-반응 시간 무작위화 + 서버측 얼굴 3D
  기하 검증(예: MediaPipe Face Mesh 468 랜드마크 기반 실제 3D pose 추정) 이 필요.
- **첫 프레임 정면 복귀 확인 생략**: 마지막 방향 챌린지 통과 직후 곧바로 `runScan` 이
  실행되므로, 사용자가 아직 회전된 자세로 embedding 이 캡처될 수 있다. 실사용 관찰 후
  필요 시 정면 대기 프레임을 추가.

즉 이번 랜덤화는 "가장 준비하기 쉬운 사전 각본 공격"이라는 하나의 진입 경로만 값싸게
막는 완화책이며, 라이브니스 문제 자체를 해결하지 않는다. 실제 서비스에서는 서버측 3D
pose 검증 또는 능동적 무작위 각도(예: "45도까지 돌리세요") 지시 + 각도 정량 검증이
필요하다.

### 5-4. 설계안 대비 편차

| 항목 | 원 설계안(§5, 2026-08-04 이전) | 현재 구현 |
|---|---|---|
| 챌린지 방향 | 세션마다 랜덤 1회 (왼/오 50:50) | **매 시도 4개 시퀀스 중 랜덤 (좌우 연속 포함)** |
| 정면 확인 단계 | 챌린지 앞·뒤 각 1회 | 2단계부터 `requireReset` 로 대체 (|yaw|&lt;0.05 관측) |
| 방향당 타임아웃 | 2초 | 5초 (첫 사용자에게 관대) |
| 챌린지 실패 시 처리 | 재시도 유도 or 즉시 실패 | 즉시 실패, 사용자에게 재시도 안내 |
| yaw 헬퍼 함수 이름 | `computeYaw(landmarks)` | `computeYawRatio(landmarkPositions)` |
| 로그 필드 | 없음 | `challengeSequence` (배열, `analyze-spoof-logs.js` 에 컬럼 노출) |

---

## 6. 프로덕션 전환 시 체크리스트

- [ ] `data/db.json` → PostgreSQL/MySQL 등 실제 DB로 교체 (Prisma 권장)
- [ ] 얼굴 특징 벡터(embedding) 암호화 저장 (생체정보는 개인정보보호법상 민감정보)
- [ ] HTTPS 배포 (카메라 API 필수 요건)
- [x] 라이브니스: **DeepFace(MiniFASNet) 기반으로 교체 완료** (`app/api/deepface/route.js` + `deepface-api/`)
- [ ] DeepFace 서버를 로컬 프로세스가 아닌 컨테이너/원격 GPU 서버로 배포 (`DEEPFACE_API_URL` 환경변수로 지정)
- [ ] 카카오 알림톡 등 실제 알림 발송 연동 (`/api/attendance` SUCCESS 시점에 훅 추가)
- [ ] 얼굴 데이터 수집 동의 절차(UI) 및 보관기간 정책 반영
- [ ] 관리자 인증(로그인) 추가 — 현재 `/dashboard` 는 인증 없이 접근 가능
- [ ] 위조 판별 / 매칭 임계값 실측 데이터 기반 재보정

---

## 7. 폴더 구조

```
deepface-api/            Python(Flask) 얼굴 임베딩 + 라이브니스 서버 (별도 프로세스)
  run.py                 Flask 개발서버 실행 스크립트 (port 5005)
  requirements.txt       deepface / tf-keras / flask / torch(CPU) 등
  README.md              서버 실행 방법 상세
app/
  page.js                홈
  register/page.js       얼굴 등록 (DeepFace 임베딩 저장)
  attendance/page.js     출결 체크 (클라이언트 검증 + DeepFace 검증 + cosine 매칭)
  dashboard/page.js      관리자 대시보드 (서버 컴포넌트)
  api/users/route.js     사용자 등록/조회/삭제 API (embedding 저장)
  api/attendance/route.js  출결 기록 / 이상탐지 로그 API
  api/deepface/route.js  DeepFace 서버 프록시 (CORS 회피)
components/
  FaceCapture.js         카메라 + face-api.js 캡처 + 프레임 이미지 base64 반환
lib/
  db.js                  파일 기반 저장소 (users, attendanceLogs, antiSpoofLogs)
  clientVision.js        EAR/jitter/synthetic score 계산 (클라이언트 1차 방어선)
  vectorMath.js          cosine distance (Facenet512 매칭)
public/models/           face-api.js 사전학습 가중치
data/db.json             데모 데이터 저장 파일
```

기획 배경 및 요구사항 명세는 별도로 전달된 `얼굴인식_출결관리시스템_기획_요구사항명세서.md`를 참고하세요.
