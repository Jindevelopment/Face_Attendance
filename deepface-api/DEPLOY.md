# 얼굴 인식 서버 배포 (Hugging Face Spaces)

Vercel 에는 웹사이트만 올라간다. 이 파이썬 서버는 별도로 올려야 한다.

**왜 나눠야 하나**: 이 서버는 TensorFlow + PyTorch 를 올린 채 계속 떠 있어야 하고
메모리를 2GB 가까이 쓴다. 서버리스 함수는 요청마다 새로 뜨고 용량 제한이 있어 감당하지 못한다.

Hugging Face Spaces 를 쓰는 이유는 무료 CPU 티어가 16GB 라 이 용도에 맞기 때문이다.

---

## 1. 서명 키 만들기

먼저 이 서버와 웹사이트가 나눠 가질 키를 만든다. **이건 로컬에서 만들어 둔다.**

```cmd
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

나온 값을 메모해 둔다. 뒤에서 두 곳에 넣는다.

> 이 키가 없으면 주소를 아는 누구나 얼굴 이미지를 보내 분석시킬 수 있다.
> 저장되는 데이터는 없지만 남의 계산 자원을 그대로 쓰게 된다.
> 그래서 공개 호스팅으로 판단되면(`SPACE_ID` 존재) 키 없이는 모든 요청을 503 으로 거부한다.

---

## 2. Space 만들기

1. [huggingface.co](https://huggingface.co) 가입 → **New Space**
2. 설정:

   | 항목 | 값 |
   |---|---|
   | Space name | `facegate-deepface` (자유) |
   | License | 자유 |
   | SDK | **Docker** → **Blank** |
   | Hardware | **CPU basic (무료)** |
   | Visibility | Public 또는 Private |

> **Private 으로 두면** 호출할 때 Hugging Face 토큰이 추가로 필요해 설정이 번거로워진다.
> Public 으로 두고 1번의 키로 막는 편이 단순하다. 어차피 이 서버는 아무것도 저장하지 않는다.

---

## 3. 파일 올리기

`deepface-api` 폴더의 내용을 Space 저장소 **최상단**에 올린다.
(Space 저장소는 이 프로젝트와 별개의 git 저장소다.)

올릴 파일:

```
Dockerfile
requirements.txt
run.py
README.md        ← SPACE_README.md 를 이 이름으로 올린다
```

> `SPACE_README.md` 의 맨 위 `---` 블록에 `sdk: docker` 와 `app_port: 7860` 이 들어 있다.
> Hugging Face 는 이 값을 보고 컨테이너를 띄우므로, 이름을 `README.md` 로 바꿔 올려야 한다.

**웹 UI 로 올리는 경우**: Space 페이지 → **Files** → **Add file** → **Upload files**

**git 으로 올리는 경우**:

```bash
git clone https://huggingface.co/spaces/<사용자명>/facegate-deepface
cd facegate-deepface
cp /path/to/face-attendance/deepface-api/{Dockerfile,requirements.txt,run.py} .
cp /path/to/face-attendance/deepface-api/SPACE_README.md README.md
git add . && git commit -m "FaceGate DeepFace API" && git push
```

---

## 4. 키 등록

Space → **Settings** → **Variables and secrets** → **New secret**

| Name | Value |
|---|---|
| `DEEPFACE_API_KEY` | 1번에서 만든 값 |

**Variable 이 아니라 Secret 으로** 넣는다. Variable 은 빌드 로그에 노출된다.

---

## 5. 빌드 기다리기

**10~20분** 걸린다. torch 와 tensorflow 를 받고, 모델 가중치까지 이미지에 굽기 때문이다.
Space 페이지의 **Logs** 에서 진행 상황을 볼 수 있다.

빌드가 끝나고 아래가 보이면 성공이다.

```
[deepface-api] serving on http://0.0.0.0:7860
```

확인:

```bash
curl https://<사용자명>-facegate-deepface.hf.space/health
# {"status":"ok","auth":true}
```

`"auth": false` 가 나오면 4번의 Secret 이 반영되지 않은 것이다.

> **무료 티어는 48시간 요청이 없으면 잠든다.** 잠든 뒤 첫 요청은 깨어나느라
> 30~60초 걸리고, 그 사이 출결 스캔이 타임아웃될 수 있다. 수업 시작 전에
> `/health` 를 한 번 호출해 깨워두면 된다.

---

## 6. 웹사이트에 연결

Vercel → 프로젝트 → **Settings** → **Environment Variables**

| Name | Value |
|---|---|
| `DEEPFACE_API_URL` | `https://<사용자명>-facegate-deepface.hf.space/represent-liveness` |
| `DEEPFACE_API_KEY` | 1번에서 만든 값 (Space 에 넣은 것과 **같아야** 한다) |

주소 끝의 `/represent-liveness` 를 빠뜨리지 않는다.

로컬에서도 이 서버를 쓰려면 `.env.local` 에 같은 두 줄을 넣으면 된다.
그러면 파이썬 서버를 로컬에서 띄우지 않아도 된다.

---

## 7. 확인

배포된 사이트에서 출결 스캔을 한 번 해본다.

| 증상 | 원인 |
|---|---|
| `DeepFace 서버 꺼짐` | `DEEPFACE_API_URL` 미설정 또는 오타 |
| `HTTP 401` | 양쪽 `DEEPFACE_API_KEY` 가 다름 |
| `HTTP 503` | Space 에 Secret 을 넣지 않음 |
| 첫 요청만 타임아웃 | Space 가 잠들어 있었음. 다시 시도 |
