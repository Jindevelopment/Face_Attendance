"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as faceapi from "face-api.js";
import { computeEAR, detectBlink, landmarkJitterScore, computeSyntheticScore } from "@/lib/clientVision";

const MODEL_URL = "/models";
const SCAN_FRAME_COUNT = 14;
const SCAN_INTERVAL_MS = 110;
const JITTER_THRESHOLD = 0.35; // px 단위, 데모용 임계값(재보정 필요)
const SYNTHETIC_SUSPECT_THRESHOLD = 60; // 0~100, 이상이면 AI 생성 의심

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

  useEffect(() => {
    let cancelled = false;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 480, height: 480, facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraReady(true);
      } catch (e) {
        setError("카메라 접근 실패: " + e.message + " (브라우저 카메라 권한을 확인해주세요)");
      }
    }
    startCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const detectOptions = useRef(
    new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
  ).current;

  const runScan = useCallback(async () => {
    if (!modelsLoaded || !cameraReady || scanning) return;
    setError("");
    setScanning(true);
    setProgress(0);
    setLiveMetrics(null);

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

    // 1) 라이브니스: 눈 깜빡임 + 미세 움직임(jitter)
    const earSeq = frames.map((f) => computeEAR(f.landmarks.positions));
    const blinkDetected = detectBlink(earSeq);
    const jitterScore = landmarkJitterScore(frames.map((f) => f.landmarks.positions));
    const livenessPassed = blinkDetected || jitterScore > JITTER_THRESHOLD;

    // 2) AI 생성 이미지 판별(휴리스틱): 마지막 프레임의 얼굴 영역 crop
    const last = frames[frames.length - 1];
    const syntheticResult = extractSyntheticScore(videoRef.current, last.detection.box);

    // 3) 얼굴 디스크립터 (매칭용)
    const descriptor = Array.from(last.descriptor);

    const metrics = {
      blinkDetected,
      jitterScore: Number(jitterScore.toFixed(3)),
      livenessPassed,
      syntheticScore: syntheticResult.score,
      syntheticSuspect: syntheticResult.score >= SYNTHETIC_SUSPECT_THRESHOLD,
      framesUsed: frames.length,
      descriptor,
      box: last.detection.box,
    };

    setLiveMetrics(metrics);
    drawOverlay(last, livenessPassed && !metrics.syntheticSuspect ? "pass" : "fail");
    setScanning(false);

    onCapture?.(metrics);
  }, [modelsLoaded, cameraReady, scanning, detectOptions, onCapture]);

  function drawOverlay(detection, status) {
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
  }

  function clearOverlay() {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

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
      </div>

      {error && (
        <div className="mono" style={{ color: "var(--accent-danger)", fontSize: 12, marginTop: 12, textAlign: "center" }}>
          {error}
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
          {scanning ? `스캔 중... ${progress}%` : actionLabel}
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

function MetricsReadout({ metrics }) {
  const rows = [
    ["BLINK_DETECTED", metrics.blinkDetected ? "YES" : "NO", metrics.blinkDetected ? "var(--accent-verify)" : "var(--accent-warn)"],
    ["JITTER_SCORE", metrics.jitterScore, "var(--text)"],
    ["LIVENESS", metrics.livenessPassed ? "PASS" : "FAIL", metrics.livenessPassed ? "var(--accent-verify)" : "var(--accent-danger)"],
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
