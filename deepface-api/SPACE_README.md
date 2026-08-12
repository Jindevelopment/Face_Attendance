---
title: FaceGate DeepFace API
emoji: 🔒
colorFrom: green
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# FaceGate — 얼굴 임베딩 + 라이브니스 서버

FaceGate 출결 시스템이 쓰는 얼굴 분석 서버입니다.
이미지를 받아 **얼굴 특징 벡터(512차원)** 와 **실물 여부**를 돌려줍니다.

- 얼굴 인식: Facenet512
- 라이브니스: MiniFASNet (DeepFace `anti_spoofing`)
- 얼굴 검출: RetinaFace

**이 서버는 아무것도 저장하지 않습니다.** 요청을 처리하고 결과만 반환합니다.

## 인증

`DEEPFACE_API_KEY` 를 Space **Settings → Variables and secrets** 에 Secret 으로 넣어야 합니다.
넣지 않으면 모든 요청을 503 으로 거부합니다 — 공개 주소에서 인증 없이 도는 상태를
막기 위해서입니다.

요청에는 `X-API-Key` 헤더가 필요합니다.

## 엔드포인트

| Method | Path | 설명 |
|---|---|---|
| GET | `/health` | 상태 확인 (키 불필요) |
| POST | `/represent-liveness` | **주 사용.** 임베딩 + 실물 판정 |

```bash
curl -X POST https://<space>.hf.space/represent-liveness \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <키>" \
  -d '{"img":"data:image/jpeg;base64,...","model_name":"Facenet512","detector_backend":"retinaface"}'
```

응답:

```json
{
  "embedding": [ /* 512개 float */ ],
  "is_real": true,
  "antispoof_score": 0.98,
  "facial_area": { "x": 417, "y": 542, "w": 382, "h": 492 },
  "face_confidence": 1.0
}
```

## 참고

첫 기동은 모델을 메모리에 올리느라 30~60초 걸립니다. 가중치 자체는 이미지에 미리
구워져 있어 다시 내려받지 않습니다.
