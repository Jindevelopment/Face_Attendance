# deepface-api

Face_Attendance 프로젝트의 **얼굴 임베딩 + 라이브니스(anti-spoofing) 서버**.
Next.js 앱과 완전히 분리된 Python(Flask) 프로세스로 동작하며,
Next.js 는 `/api/deepface` 프록시 라우트를 통해서만 이 서버를 호출한다.

- 얼굴 인식 모델: **Facenet512** (512차원 임베딩)
- 라이브니스 모델: **MiniFASNet** (DeepFace 의 `anti_spoofing=True` 옵션이 로드)
- 기본 포트: `5005`
- Windows/macOS/Linux 모두 Flask 개발서버로 실행 (gunicorn 미사용)

---

## 1. 실행 방법 (Windows)

> ⚠️ **Python 3.11 을 써야 한다.** torch 2.4.1 은 3.12 이상용 빌드가 없다.
> 3.14 로 venv 를 만들면 `pip install` 은 성공하는 것처럼 보이지만, 실행 시
> `ImportError: Failed to load PyTorch C extensions` 로 죽는다 (2026-08-12 확인).
> `py -0` 으로 설치된 버전을 확인할 수 있다.

```cmd
cd deepface-api

:: (1) venv 생성 — 반드시 3.11
py -3.11 -m venv .venv

:: (2) torch CPU 빌드 먼저 설치 (용량이 커서 별도로 미리)
.venv\Scripts\python.exe -m pip install torch==2.4.1 --index-url https://download.pytorch.org/whl/cpu

:: (3) 나머지 의존성 설치
.venv\Scripts\python.exe -m pip install -r requirements.txt

:: (4) 환경변수 파일 준비 (선택)
copy .env.example .env

:: (5) 서버 실행
.venv\Scripts\python.exe run.py
```

> 💡 **`activate` 를 쓰지 않는 이유**: 활성화 명령이 셸마다 다르다
> (cmd `.venv\Scripts\activate.bat`, PowerShell `.\.venv\Scripts\Activate.ps1`).
> 셸을 착각해 활성화가 안 된 채 `pip install` 을 하면 **전역 파이썬에 설치되어**
> 원인을 찾기 어려운 버전 오류가 난다. `python.exe` 를 직접 부르면 이 실수가 없다.

macOS / Linux 는 `python3.11 -m venv .venv` 후 `.venv/bin/python` 을 같은 방식으로 부르면 된다.

첫 실행 시 DeepFace 가 Facenet512 가중치 (약 90MB), MiniFASNet, RetinaFace 가중치를 자동 다운로드한다.
다운로드가 끝나면 다음과 같은 로그가 뜬다:

```
[deepface-api] preloading facial_recognition: Facenet512
[deepface-api] preloading anti_spoofing: Fasnet (MiniFASNet)
[deepface-api] preloading face_detector: retinaface
[deepface-api] preloading face_detector: opencv
[deepface-api] warm-up represent() ok (model=Facenet512, detector=retinaface)
[deepface-api] serving on http://0.0.0.0:5005  (POST /represent, /represent-liveness, /verify, /analyze)
```

### 환경 변수

| 변수                                | 기본값             | 설명 |
| ----------------------------------- | ------------------ | ---- |
| `DEEPFACE_HOST`                     | `0.0.0.0`          | 바인딩 호스트 |
| `DEEPFACE_PORT`                     | `5005`             | 바인딩 포트 |
| `DEEPFACE_FACE_RECOGNITION_MODELS`  | `Facenet512`       | 서버 부팅 시 프리로드할 인식 모델 (쉼표 구분) |
| `DEEPFACE_FACE_DETECTION_MODELS`    | `retinaface,opencv`| 서버 부팅 시 프리로드할 감지기 (쉼표 구분) |
| `DEEPFACE_ANTI_SPOOFING`            | `1`                | `1` 이면 MiniFASNet 프리로드 |

---

## 2. 헬스 체크

`/represent-liveness` 는 얼굴이 포함된 이미지를 요구하므로,
서버가 살아있는지 확인할 때는 임의의 얼굴 사진(base64) 하나로 요청을 보내면 된다.

```bash
# 파일에서 base64 로 인코딩 후 요청 (macOS/Linux)
IMG=$(base64 -w0 sample.jpg)
curl -s -X POST http://localhost:5005/represent-liveness \
  -H "Content-Type: application/json" \
  -d "{\"img\":\"data:image/jpeg;base64,${IMG}\",\"model_name\":\"Facenet512\",\"detector_backend\":\"retinaface\"}" | jq .
```

정상 응답 예시(요약):

```json
{
  "model_name": "Facenet512",
  "detector_backend": "retinaface",
  "embedding": [ /* 512개 float */ ],
  "facial_area": { "x": 417, "y": 542, "w": 382, "h": 492, "left_eye": [743,699], "right_eye": [583,711] },
  "face_confidence": 1.0,
  "is_real": true,
  "antispoof_score": 0.98
}
```

---

## 3. 사용 엔드포인트

| Method | Path                    | 용도 |
| ------ | ----------------------- | ---- |
| POST   | `/represent-liveness`   | **주 사용.** 얼굴 임베딩(512-d) + 라이브니스(is_real, antispoof_score) 를 한 번에 반환 |
| POST   | `/represent`            | DeepFace 원본. `anti_spoofing=true` 넘겨도 응답에 is_real/antispoof_score **포함 안 됨** (v0.0.93 한계). 스푸핑 감지 시 400 |

**왜 커스텀 엔드포인트가 필요한가?**
DeepFace 0.0.93 의 `/represent` 는 `anti_spoofing=True` 를 넘겨도 성공 응답에
`is_real` / `antispoof_score` 필드를 넣지 않고, 스푸핑 감지 시 예외만 던진다
(`representation.py:113`). `extract_faces()` 는 두 필드를 그대로 반환하므로
`run.py` 의 `_register_liveness_route()` 가 두 호출을 조합한 `/represent-liveness`
를 노출한다.

`/verify`, `/analyze` 등 다른 엔드포인트는 이 프로젝트에서 사용하지 않는다
(DB 연동은 Next.js 쪽에서 Supabase 로 처리한다 — `lib/db.js`).
이 서버는 상태를 갖지 않는다. 이미지를 받아 임베딩과 라이브니스 판정만 돌려주고,
저장은 전부 Next.js 쪽이 담당한다.

---

## 4. Next.js 앱과의 연결

- Next.js 는 브라우저에서 직접 5005 포트를 호출하지 않는다 (CORS/방화벽 회피).
- 대신 `app/api/deepface/route.js` 서버 라우트가 프록시로 요청을 중계한다.
- 프록시 요청 body 형식:

```json
{ "image": "data:image/jpeg;base64,....", "mode": "register" | "attendance" }
```

프록시는 이 요청을 내부적으로 `POST http://localhost:5005/represent-liveness` 로 변환한다.
`DEEPFACE_API_URL` 환경변수로 이 URL 을 오버라이드할 수 있다.
