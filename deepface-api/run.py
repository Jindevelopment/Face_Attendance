"""DeepFace REST API 로컬 실행 스크립트.

- Next.js 앱과 별도 프로세스로 동작하는 얼굴 임베딩/라이브니스 판별 서버.
- Flask 개발서버로 실행 (Windows 에서 gunicorn 이 동작하지 않으므로 사용하지 않음).
- 포트: 5005 (Next.js /api/deepface 프록시에서만 호출).

환경 변수:
    DEEPFACE_HOST                       기본값 0.0.0.0
    DEEPFACE_PORT                       기본값 5005
    DEEPFACE_FACE_RECOGNITION_MODELS    프리로드할 인식 모델 (기본 Facenet512)
    DEEPFACE_FACE_DETECTION_MODELS      프리로드할 감지기 (기본 retinaface,opencv)
    DEEPFACE_ANTI_SPOOFING              1 이면 라이브니스 모델(Fasnet) 프리로드
    DEEPFACE_API_KEY                    설정 시 X-API-Key 헤더를 요구 (공개 배포 시 필수)
"""
from __future__ import annotations

import os
import sys
import traceback

from dotenv import load_dotenv


def _preload_models() -> None:
    """콜드 스타트 지연을 줄이기 위해 요청 전에 모델을 미리 메모리에 올린다."""
    from deepface import DeepFace
    from deepface.modules import modeling

    recognition_models = os.environ.get(
        "DEEPFACE_FACE_RECOGNITION_MODELS", "Facenet512"
    )
    for name in [m.strip() for m in recognition_models.split(",") if m.strip()]:
        print(f"[deepface-api] preloading facial_recognition: {name}", flush=True)
        modeling.build_model(task="facial_recognition", model_name=name)

    if os.environ.get("DEEPFACE_ANTI_SPOOFING", "1") == "1":
        print("[deepface-api] preloading anti_spoofing: Fasnet (MiniFASNet)", flush=True)
        modeling.build_model(task="spoofing", model_name="Fasnet")

    # /represent-liveness 는 retinaface 를 사용한다. opencv 도 fallback 용으로 워밍업.
    detection_models = os.environ.get(
        "DEEPFACE_FACE_DETECTION_MODELS", "retinaface,opencv"
    )
    for name in [m.strip() for m in detection_models.split(",") if m.strip()]:
        print(f"[deepface-api] preloading face_detector: {name}", flush=True)
        modeling.build_model(task="face_detector", model_name=name)

    # 실제 파이프라인 한 번 통과시켜 lazy 초기화 마무리 (retinaface 첫 추론이 특히 무거움).
    try:
        import numpy as np

        primary_recognition = recognition_models.split(",")[0].strip() or "Facenet512"
        primary_detector = detection_models.split(",")[0].strip() or "retinaface"
        dummy = (np.random.rand(320, 320, 3) * 255).astype("uint8")
        DeepFace.represent(
            img_path=dummy,
            model_name=primary_recognition,
            detector_backend=primary_detector,
            enforce_detection=False,
            anti_spoofing=False,
        )
        print(
            f"[deepface-api] warm-up represent() ok "
            f"(model={primary_recognition}, detector={primary_detector})",
            flush=True,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[deepface-api] warm-up skipped: {exc}", flush=True)


def _register_auth(app) -> None:
    """공유 키 인증.

    이 서버를 인터넷에 올리면(예: Hugging Face Spaces) 주소를 아는 누구나 얼굴 이미지를
    보내 분석시킬 수 있다. 저장되는 데이터는 없지만 남의 계산 자원을 그대로 쓰게 되고,
    무료 얼굴 분석 API 로 전용될 수 있다.

    DEEPFACE_API_KEY 가 설정돼 있으면 X-API-Key 헤더를 요구한다.

    설정되지 않은 경우:
      - 로컬 실행이면 통과시킨다 (개발할 때마다 키를 만들게 하면 번거롭다).
      - 공개 호스팅으로 판단되면 거부한다. Hugging Face Spaces 는 SPACE_ID 를 넣어주므로
        그것으로 구분한다. "동작은 하는데 아무나 쓸 수 있는" 상태가 조용히 유지되는 편이
        더 위험하다.
    """
    from flask import jsonify, request

    api_key = os.environ.get("DEEPFACE_API_KEY", "").strip()
    is_public_host = bool(os.environ.get("SPACE_ID"))

    if not api_key:
        if is_public_host:
            print(
                "[deepface-api] 경고: 공개 호스팅인데 DEEPFACE_API_KEY 가 없습니다. "
                "모든 요청을 거부합니다. Space 설정에서 Secret 을 추가하세요.",
                flush=True,
            )
        else:
            print(
                "[deepface-api] DEEPFACE_API_KEY 미설정 — 인증 없이 동작합니다 (로컬 개발용).",
                flush=True,
            )

    # 헬스체크는 키 없이 열어둔다. 호스팅 쪽에서 상태를 확인해야 하고,
    # 응답에 정보가 담기지 않는다.
    OPEN_PATHS = {"/health"}

    @app.before_request
    def _check_api_key():  # noqa: ANN202
        if request.method == "OPTIONS" or request.path in OPEN_PATHS:
            return None
        if not api_key:
            if is_public_host:
                return (
                    jsonify(
                        {
                            "error": "server_misconfigured",
                            "message": "DEEPFACE_API_KEY 가 설정되지 않았습니다.",
                        }
                    ),
                    503,
                )
            return None
        if request.headers.get("X-API-Key") != api_key:
            return jsonify({"error": "unauthorized"}), 401
        return None

    @app.route("/health", methods=["GET"])
    def health():  # noqa: ANN202
        return jsonify({"status": "ok", "auth": bool(api_key)})


def _register_liveness_route(app) -> None:
    """/represent-liveness: 임베딩 + 라이브니스 점수를 한 번에 반환하는 커스텀 엔드포인트.

    DeepFace 0.0.93 의 /represent 는 anti_spoofing=True 를 넘겨도 응답에
    is_real / antispoof_score 를 포함하지 않고, 스푸핑 감지 시 예외만 던진다
    (representation.py:113). extract_faces() 는 두 필드를 그대로 반환하므로,
    extract_faces 로 라이브니스 판정 + 얼굴 크롭을 얻고, 그 크롭을
    represent(detector_backend='skip') 에 넘겨서 embedding 만 추출한다.
    """
    from flask import jsonify, request
    from deepface import DeepFace

    def _py(value):
        # numpy scalar → Python primitive (Flask jsonify 는 np.bool_/np.float32 를 못 다룸).
        try:
            import numpy as np

            if isinstance(value, (np.bool_,)):
                return bool(value)
            if isinstance(value, (np.integer,)):
                return int(value)
            if isinstance(value, (np.floating,)):
                return float(value)
        except Exception:  # noqa: BLE001
            pass
        return value

    @app.route("/represent-liveness", methods=["POST"])
    def represent_liveness():
        try:
            input_args = request.get_json(silent=True) or {}
            img = input_args.get("img") or input_args.get("img_path")
            if not img:
                return jsonify({"error": "img (base64/path/url) 이 필요합니다."}), 400

            model_name = input_args.get("model_name", "Facenet512")
            detector_backend = input_args.get("detector_backend", "retinaface")
            enforce_detection = input_args.get("enforce_detection", True)
            align = input_args.get("align", True)

            # 1) 얼굴 검출 + 라이브니스 판정 (extract_faces 는 두 필드를 그대로 노출).
            try:
                faces = DeepFace.extract_faces(
                    img_path=img,
                    detector_backend=detector_backend,
                    enforce_detection=enforce_detection,
                    align=align,
                    anti_spoofing=True,
                )
            except ValueError as e:
                # 얼굴 미검출 등: 사용자에게 곧바로 안내할 수 있게 400.
                return (
                    jsonify({"error": "face_not_detected", "message": str(e)}),
                    400,
                )

            if not faces:
                return (
                    jsonify(
                        {
                            "error": "face_not_detected",
                            "message": "DeepFace 가 얼굴을 찾지 못했습니다.",
                        }
                    ),
                    400,
                )

            first = faces[0]
            face_crop = first["face"]  # RGB, [0,1] float (normalize_face 기본 True)
            facial_area = first.get("facial_area")
            face_confidence = _py(first.get("confidence"))
            is_real = _py(first.get("is_real"))
            antispoof_score = _py(first.get("antispoof_score"))

            # 2) 잘라낸 얼굴에 대해 embedding 추출 (detector 는 skip).
            #    representation.py 의 skip 브랜치는 face 를 그대로 사용해 flip → 정규화 → forward.
            try:
                emb_objs = DeepFace.represent(
                    img_path=face_crop,
                    model_name=model_name,
                    detector_backend="skip",
                    enforce_detection=False,
                    align=False,
                    anti_spoofing=False,
                )
            except Exception as e:  # noqa: BLE001
                return (
                    jsonify(
                        {
                            "error": "embedding_failed",
                            "message": f"임베딩 추출 실패: {e}",
                        }
                    ),
                    500,
                )

            embedding = None
            if emb_objs:
                embedding = emb_objs[0].get("embedding")

            if not isinstance(embedding, list) or not embedding:
                return (
                    jsonify(
                        {
                            "error": "embedding_failed",
                            "message": "임베딩이 반환되지 않았습니다.",
                        }
                    ),
                    500,
                )

            return jsonify(
                {
                    "model_name": model_name,
                    "detector_backend": detector_backend,
                    "embedding": embedding,
                    "facial_area": facial_area,
                    "face_confidence": face_confidence,
                    "is_real": is_real,
                    "antispoof_score": antispoof_score,
                }
            )
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            return (
                jsonify(
                    {
                        "error": "internal_error",
                        "message": f"/represent-liveness 처리 중 오류: {e}",
                    }
                ),
                500,
            )


def main() -> int:
    load_dotenv()

    host = os.environ.get("DEEPFACE_HOST", "0.0.0.0")
    port = int(os.environ.get("DEEPFACE_PORT", "5005"))

    # DeepFace 내장 Flask 앱을 그대로 사용한다.
    # /represent, /verify, /analyze 엔드포인트가 자동 등록됨.
    from deepface.api.src.app import create_app

    app = create_app()
    _register_auth(app)
    _register_liveness_route(app)

    # 도커 이미지에 가중치를 미리 구워두면(preload 단계) 여기서는 메모리에 올리기만 한다.
    _preload_models()

    print(
        f"[deepface-api] serving on http://{host}:{port}  "
        f"(POST /represent, /represent-liveness, /verify, /analyze)",
        flush=True,
    )
    app.run(host=host, port=port, debug=False, use_reloader=False, threaded=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
