"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as faceapi from "face-api.js";
import {
  computeEAR,
  detectBlink,
  landmarkJitterScore,
  computeSyntheticScore,
  computeYawRatio,
} from "@/lib/clientVision";

const MODEL_URL = "/models";
const SCAN_FRAME_COUNT = 14;
const SCAN_INTERVAL_MS = 110;
const SYNTHETIC_SUSPECT_THRESHOLD = 60; // 0~100, 이상이면 AI 생성 의심

// 능동 챌린지(active liveness) 파라미터.
// 매 스캔마다 랜덤 시퀀스(좌우 조합 4가지 중 1)를 뽑아 순차 지시. 각 단계는 |yawRatio| ≥
// YAW_THRESHOLD 도달로 통과. 통과 시에만 DeepFace 파이프라인 진입.
// 2단계부터는 requireReset=true 로 두어, 이전 단계의 yaw 가 남아있는 상태에서 즉시
// 통과되지 않도록 |yaw| < RESET_YAW 를 먼저 관측한 뒤에만 목표 방향 도달을 검사한다.
const YAW_THRESHOLD = 0.15;
const RESET_YAW = 0.05;
const CHALLENGE_TIMEOUT_MS = 5000;
const CHALLENGE_INTERVAL_MS = 100;

const CHALLENGE_SEQUENCES = [
  ["left", "right"],
  ["right", "left"],
  ["left", "left"],
  ["right", "right"],
];

function pickChallengeSequence() {
  return CHALLENGE_SEQUENCES[Math.floor(Math.random() * CHALLENGE_SEQUENCES.length)];
}

function directionLabel(dir) {
  return dir === "left" ? "왼쪽" : "오른쪽";
}

function buildChallengePrompt(sequence, step) {
  const label = directionLabel(sequence[step]);
  if (step === 0) return `고개를 ${label}으로 살짝 돌려주세요`;
  const prev = sequence[step - 1];
  if (prev === sequence[step]) {
    return `정면으로 돌아온 뒤 다시 ${label}으로 돌려주세요`;
  }
  return `정면으로 돌아온 뒤 이번엔 ${label}으로 돌려주세요`;
}

export default function FaceCapture({ onCapture, actionLabel = "스캔 시작" }) {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const streamRef = useRef(null);

  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [liveMetrics, setLiveMetrics] = useState(null);
  // 능동 챌린지 지시 문구. null 이면 배너 미표시(= 챌린지 중 아님 또는 캡처 스캔 단계).
  const [challengePrompt, setChallengePrompt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadModels() {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        if (!cancelled) setModelsLoaded(true);
      } catch (e) {
        if (!cancelled) setError("모델 로드 실패: " + e.message);
      }
    }
    loadModels();
    return () => {
      cancelled = true;
    };
  }, []);

  // 카메라 장치 목록과 현재 선택. deviceId 를 지정하지 않으면 브라우저가 기본 장치를
  // 고르는데, 그게 가상 카메라(팀즈/줌/제조사 유틸)면 프레임이 한 장도 오지 않는다.
  // 실제로 이 노트북에서 Mirametrix 가상 카메라가 기본으로 잡혀 검은 화면이 나왔다.
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        // 권한을 받기 전에는 enumerateDevices() 가 장치 label 을 빈 문자열로 준다.
        // 그래서 스트림을 먼저 열고, 그 다음에 목록을 읽는다.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: 480, height: 480 }
            : { width: 480, height: 480, facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        // 장치를 바꾸는 경우 이전 스트림을 먼저 정리한다. 안 그러면 카메라 LED 가
        // 켜진 채로 남고, 장치에 따라 두 번째 열기가 실패한다.
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          // 스트림을 받은 것과 프레임이 오는 것은 다르다. 가상 카메라는 트랙만 주고
          // 영상을 내보내지 않는 경우가 있는데, 이때 "준비 완료" 로 표시하면
          // 사용자가 스캔을 눌러도 얼굴이 영영 잡히지 않는다.
          // 실제로 재생이 시작될 때까지 기다린다.
          await new Promise((resolve) => {
            if (video.readyState >= 2 && video.videoWidth > 0) return resolve();
            video.onloadeddata = () => resolve();
          });
        }
        if (cancelled) return;

        if (video && video.videoWidth === 0) {
          setError(
            "카메라에서 영상이 오지 않습니다. 아래에서 다른 카메라를 선택해보세요 " +
              "(가상 카메라가 기본으로 잡힌 경우일 수 있습니다)."
          );
          setCameraReady(false);
        } else {
          setError("");
          setCameraReady(true);
        }

        const list = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          setDevices(list.filter((d) => d.kind === "videoinput"));
          // 지금 실제로 열린 장치를 선택 상태로 반영한다.
          const active = stream.getVideoTracks()[0]?.getSettings?.().deviceId;
          if (active && !deviceId) setDeviceId(active);
        }
      } catch (e) {
        setCameraReady(false);
        setError("카메라 접근 실패: " + e.message + " (브라우저 카메라 권한을 확인해주세요)");
      }
    }

    startCamera();
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  // 언마운트 시에만 트랙을 정리한다. 장치 전환 중 정리는 startCamera 안에서 한다.
  useEffect(() => {
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const detectOptions = useRef(
    new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
  ).current;

  // 오버레이 그리기/지우기는 아래 runChallenge·runScan 이 호출하므로 그보다 먼저 선언한다.
  // (함수 선언은 호이스팅되지만, 선언 전 참조는 react-hooks 규칙 위반이다.)
  const drawOverlay = useCallback((detection, status) => {
    const canvas = overlayRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const box = detection.detection.box;
    const color =
      status === "pass" ? "#34d8b0" : status === "fail" ? "#ff5470" : "#f5a623";
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(box.x, box.y, box.width, box.height);
  }, []);

  const clearOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  // 챌린지 한 단계 수행. direction: "left" (본인 왼쪽, yawRatio > +YAW_THRESHOLD)
  //                             "right" (본인 오른쪽, yawRatio < -YAW_THRESHOLD)
  // requireReset=true 이면 |yaw| < RESET_YAW 를 먼저 관측한 뒤에만 목표 방향 검사 시작
  // (같은 방향 연속 시퀀스에서 이전 상태 잔존으로 인한 즉시 통과 방지).
  // 5초 안에 조건 충족 시 true, 타임아웃 시 false.
  const runChallenge = useCallback(
    async (direction, { requireReset = false } = {}) => {
      const expectedSign = direction === "left" ? 1 : -1;
      const startedAt = Date.now();
      let resetSeen = !requireReset;
      while (Date.now() - startedAt < CHALLENGE_TIMEOUT_MS) {
        const detection = await faceapi
          .detectSingleFace(videoRef.current, detectOptions)
          .withFaceLandmarks();
        if (detection) {
          drawOverlay(detection, "scanning");
          const yaw = computeYawRatio(detection.landmarks.positions);
          if (!resetSeen) {
            if (Math.abs(yaw) < RESET_YAW) resetSeen = true;
          } else {
            if (expectedSign > 0 && yaw > YAW_THRESHOLD) return true;
            if (expectedSign < 0 && yaw < -YAW_THRESHOLD) return true;
          }
        }
        await new Promise((r) => setTimeout(r, CHALLENGE_INTERVAL_MS));
      }
      return false;
    },
    [detectOptions, drawOverlay]
  );

  const runScan = useCallback(async () => {
    if (!modelsLoaded || !cameraReady || scanning) return;
    setError("");
    setScanning(true);
    setProgress(0);
    setLiveMetrics(null);

    // === 능동 챌린지 게이트: 매 시도마다 랜덤 시퀀스. 실패 시 DeepFace 호출 없이 즉시 중단. ===
    const challengeSequence = pickChallengeSequence();
    for (let step = 0; step < challengeSequence.length; step++) {
      const dir = challengeSequence[step];
      const promptText = buildChallengePrompt(challengeSequence, step);
      setChallengePrompt(promptText);
      const ok = await runChallenge(dir, { requireReset: step > 0 });
      if (!ok) {
        // 챌린지 실패는 서버 로그로 안 남는다 (DeepFace 호출 전 return). 대신 개발자 콘솔에
        // 지상 진실(어떤 시퀀스가 뽑혔고, 몇 번째에서 어떤 문구를 띄우고 어떤 방향을
        // 검사하다 실패했는지) 을 남겨서 시퀀스/문구/검사방향 불일치 의심을 사후 검증.
        console.warn("[FaceCapture] challenge failed", {
          challengeSequence: challengeSequence.map((d) => (d === "left" ? "L" : "R")),
          challengeSequenceRaw: challengeSequence,
          failedStep: step,
          bannerPromptAtFailure: promptText,
          runChallengeDir: dir,
          requireReset: step > 0,
        });
        setChallengePrompt(null);
        setError(
          `챌린지 실패: 5초 안에 지시된 방향(${directionLabel(dir)})으로 회전이 감지되지 않았습니다. 다시 시도해주세요.`
        );
        setScanning(false);
        clearOverlay();
        return;
      }
    }
    setChallengePrompt(null);

    const frames = [];
    for (let i = 0; i < SCAN_FRAME_COUNT; i++) {
      const detection = await faceapi
        .detectSingleFace(videoRef.current, detectOptions)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detection) {
        frames.push(detection);
        drawOverlay(detection, "scanning");
      }
      setProgress(Math.round(((i + 1) / SCAN_FRAME_COUNT) * 100));
      await new Promise((r) => setTimeout(r, SCAN_INTERVAL_MS));
    }

    if (frames.length < 5) {
      setError("얼굴을 안정적으로 인식하지 못했습니다. 조명을 밝게 하고 정면을 응시해주세요.");
      setScanning(false);
      clearOverlay();
      return;
    }

    // 1) 라이브니스 근거 = 능동 챌린지 통과.
    //    챌린지에 실패하면 위에서 이미 return 했으므로, 이 지점 도달 = 랜덤 시퀀스를
    //    지시대로 수행했음이 확정된 상태다.
    //
    //    blink / jitter 는 판정에서 제외하고 진단용으로만 기록한다 (README §4-1, §4-2):
    //    - jitter: "정지 사진은 안 흔들린다"는 전제가 실측에서 뒤집혔다. 폰 화면을 손에
    //      들면 손떨림이 프레임 전체를 흔들어 실물(2.458)보다 오히려 큰 값(13.947)이
    //      나온다. 임계값 통과 조건으로 쓰면 공격을 돕는 방향으로 작용한다.
    //    - blink: 스캔 구간이 1.5초(14프레임 × 110ms)로 평균 깜빡임 간격(3~4초)보다
    //      짧아 실측에서 대부분 false. 필수 조건으로 걸면 정상 사용자가 통과하지 못한다.
    const earSeq = frames.map((f) => computeEAR(f.landmarks.positions));
    const blinkDetected = detectBlink(earSeq);
    const jitterScore = landmarkJitterScore(frames.map((f) => f.landmarks.positions));
    const livenessPassed = true;

    // 2) AI 생성 이미지 판별(휴리스틱): 마지막 프레임의 얼굴 영역 crop
    const last = frames[frames.length - 1];
    const syntheticResult = extractSyntheticScore(videoRef.current, last.detection.box);

    // 3) 얼굴 디스크립터 (매칭용) — 클라이언트 1차 방어선(합성/라이브니스 휴리스틱) 유지용.
    //    실제 매칭은 서버(DeepFace Facenet512 embedding) 에서 수행하지만,
    //    descriptor 계산은 그대로 남겨둔다.
    const descriptor = Array.from(last.descriptor);

    // 4) 서버(/api/deepface) 로 보낼 원본 프레임 이미지 (JPEG base64).
    //    거울 반전(scaleX(-1)) 은 화면 표시용이라 원본 프레임 그대로 캡처한다.
    const image = extractFrameImage(videoRef.current);

    const metrics = {
      challengeSequence,
      blinkDetected,
      jitterScore: Number(jitterScore.toFixed(3)),
      livenessPassed,
      syntheticScore: syntheticResult.score,
      syntheticSuspect: syntheticResult.score >= SYNTHETIC_SUSPECT_THRESHOLD,
      framesUsed: frames.length,
      descriptor,
      image,
      box: last.detection.box,
    };

    setLiveMetrics(metrics);
    drawOverlay(last, livenessPassed && !metrics.syntheticSuspect ? "pass" : "fail");
    setScanning(false);

    onCapture?.(metrics);
  }, [
    modelsLoaded,
    cameraReady,
    scanning,
    detectOptions,
    onCapture,
    runChallenge,
    drawOverlay,
    clearOverlay,
  ]);

  return (
    <div>
      <div
        className="scan-frame"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 360,
          aspectRatio: "1/1",
          margin: "0 auto",
          background: "#000",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
        />
        <canvas
          ref={overlayRef}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            transform: "scaleX(-1)",
          }}
        />
        <div className="corner-tl" />
        <div className="corner-tr" />
        <div className="corner-bl" />
        <div className="corner-br" />
        {!cameraReady && !error && (
          <Overlay text="카메라 준비 중..." />
        )}
        {!modelsLoaded && cameraReady && (
          <Overlay text="판별 모델 로딩 중..." />
        )}
        {challengePrompt && <ChallengeBanner text={challengePrompt} />}
      </div>

      {error && (
        <div className="mono" style={{ color: "var(--accent-danger)", fontSize: 12, marginTop: 12, textAlign: "center" }}>
          {error}
        </div>
      )}

      {/* 카메라가 둘 이상일 때만 보여준다. 한 대뿐이면 고를 것이 없다. */}
      {devices.length > 1 && (
        <div style={{ marginTop: 12, textAlign: "center" }}>
          <select
            value={deviceId ?? ""}
            onChange={(e) => {
              setCameraReady(false);
              setDeviceId(e.target.value);
            }}
            disabled={scanning}
            className="mono"
            style={{
              background: "var(--panel)",
              color: "var(--text-dim)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 11.5,
              padding: "5px 8px",
              maxWidth: "100%",
            }}
          >
            {devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `카메라 ${i + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 16 }}>
        <button
          onClick={runScan}
          disabled={!modelsLoaded || !cameraReady || scanning}
          style={{
            background: scanning ? "var(--panel-raised)" : "var(--accent-verify)",
            color: scanning ? "var(--text-dim)" : "#06231c",
            border: "none",
            padding: "12px 28px",
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 14,
            cursor: modelsLoaded && cameraReady && !scanning ? "pointer" : "default",
          }}
        >
          {scanning
            ? challengePrompt
              ? "고개 회전 확인 중..."
              : `스캔 중... ${progress}%`
            : actionLabel}
        </button>
      </div>

      {liveMetrics && <MetricsReadout metrics={liveMetrics} />}
    </div>
  );
}

function Overlay({ text }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-dim)",
        fontSize: 13,
        background: "rgba(0,0,0,0.4)",
      }}
    >
      {text}
    </div>
  );
}

function ChallengeBanner({ text }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        right: 12,
        padding: "10px 14px",
        borderRadius: 8,
        background: "rgba(6, 35, 28, 0.86)",
        border: "1px solid var(--accent-verify)",
        color: "var(--accent-verify)",
        fontSize: 13,
        fontWeight: 700,
        textAlign: "center",
        letterSpacing: "-0.01em",
      }}
    >
      {text}
    </div>
  );
}

function MetricsReadout({ metrics }) {
  // BLINK/JITTER 는 판정에 쓰이지 않는 진단 지표라 강조색 없이 표시한다 (runScan 주석 참고).
  const challengeSeq = (metrics.challengeSequence || [])
    .map((d) => (d === "left" ? "L" : "R"))
    .join(" → ");
  const rows = [
    ["CHALLENGE_SEQ", challengeSeq || "-", "var(--accent-verify)"],
    ["LIVENESS", metrics.livenessPassed ? "PASS (challenge)" : "FAIL", metrics.livenessPassed ? "var(--accent-verify)" : "var(--accent-danger)"],
    ["BLINK_DETECTED (진단용)", metrics.blinkDetected ? "YES" : "NO", "var(--text-dim)"],
    ["JITTER_SCORE (진단용)", metrics.jitterScore, "var(--text-dim)"],
    ["SYNTHETIC_SCORE", `${metrics.syntheticScore} / 100`, metrics.syntheticSuspect ? "var(--accent-danger)" : "var(--accent-verify)"],
  ];
  return (
    <div className="panel mono" style={{ marginTop: 16, padding: 14, fontSize: 12.5, maxWidth: 360, marginLeft: "auto", marginRight: "auto" }}>
      {rows.map(([label, value, color]) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
          <span style={{ color: "var(--text-dim)" }}>{label}</span>
          <span style={{ color, fontWeight: 700 }}>{String(value)}</span>
        </div>
      ))}
    </div>
  );
}

function extractFrameImage(video) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, w, h);
  // DeepFace 서버 전송용. quality 0.9 로 파일 크기와 인식 정확도 균형.
  return canvas.toDataURL("image/jpeg", 0.9);
}

function extractSyntheticScore(video, box) {
  const canvas = document.createElement("canvas");
  const w = Math.max(1, Math.round(box.width));
  const h = Math.max(1, Math.round(box.height));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, box.x, box.y, w, h, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  return computeSyntheticScore(imageData);
}
