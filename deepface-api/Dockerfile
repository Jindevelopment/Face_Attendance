# Hugging Face Spaces (Docker SDK) 용 이미지.
#
# 왜 Vercel 이 아니라 여기인가:
#   이 서버는 TensorFlow + PyTorch 를 올린 채 계속 떠 있어야 하고 메모리를 2GB 가까이 쓴다.
#   서버리스 함수는 요청마다 새로 뜨고 용량 제한이 있어 감당하지 못한다.
#
# 로컬에서 그대로 돌려볼 수도 있다:
#   docker build -t facegate-deepface deepface-api
#   docker run -p 7860:7860 -e DEEPFACE_API_KEY=아무키 facegate-deepface

FROM python:3.11-slim

# torch 2.4.1 은 Python 3.12+ 용 빌드가 없다. 3.11 을 고정한다.
# (3.14 로 만들었다가 "Failed to load PyTorch C extensions" 로 막힌 적이 있다.)

# opencv 가 런타임에 필요로 하는 시스템 라이브러리.
# 빠뜨리면 import cv2 에서 libGL.so.1 을 못 찾는다.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces 는 uid 1000 으로 컨테이너를 실행한다.
# root 로 만든 파일은 쓰기가 막히므로 같은 사용자를 미리 만들어 둔다.
RUN useradd -m -u 1000 user
USER user

ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    # DeepFace 가 가중치를 내려받는 위치. 쓰기 가능한 홈으로 지정한다.
    DEEPFACE_HOME=/home/user

WORKDIR /home/user/app

# 의존성을 먼저 복사해 레이어 캐시를 살린다 (코드만 바뀌면 재설치하지 않는다).
COPY --chown=user:user requirements.txt ./

# torch 는 CPU 빌드를 따로 받는다. 기본 인덱스로 받으면 CUDA 포함본이라 몇 GB 커진다.
RUN pip install --no-cache-dir torch==2.4.1 --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt

COPY --chown=user:user . ./

# 모델 가중치(약 100MB)를 빌드 시점에 내려받아 이미지에 굽는다.
# 이걸 안 하면 컨테이너가 뜰 때마다 다시 받아 첫 요청이 몇 분씩 걸리고,
# 저장소가 초기화되는 환경에서는 재시작마다 반복된다.
RUN python -c "import run; run._preload_models()"

# Hugging Face Spaces 는 7860 포트를 노출한다 (README 의 app_port 와 맞춰야 한다).
ENV DEEPFACE_PORT=7860
EXPOSE 7860

CMD ["python", "run.py"]
