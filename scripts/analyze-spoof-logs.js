#!/usr/bin/env node
// 일회성 분석용 스크립트.
// data/db.json 의 antiSpoofLogs + attendanceLogs 를 합쳐서 최근 N개를 표로 출력한다.
// SUCCESS 는 attendanceLogs 에, REJECTED_* 는 antiSpoofLogs 에 저장되므로 둘 다 봐야 전체 흐름이 보임.
//
// 사용법:
//   node scripts/analyze-spoof-logs.js         # 최근 10개
//   node scripts/analyze-spoof-logs.js 30      # 최근 30개
//   node scripts/analyze-spoof-logs.js --all   # 전부

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");

// lib/vectorMath.js 의 FACENET512_COSINE_THRESHOLD 와 같은 값을 유지할 것.
// (저쪽은 ESM 이고 이 스크립트는 CommonJS 라 직접 import 하지 않는다.)
const MATCH_THRESHOLD = 0.25;
// 임계값 ±BAND 구간 = "아슬아슬하게 갈린" 로그. 많으면 임계값 재보정 신호.
const NEAR_BAND = 0.05;

function main() {
  const argv = process.argv.slice(2);
  const all = argv.includes("--all");
  const nArg = argv.find((a) => /^\d+$/.test(a));
  const limit = all ? Infinity : nArg ? parseInt(nArg, 10) : 10;

  if (!fs.existsSync(DB_PATH)) {
    console.error(`db.json 이 없습니다: ${DB_PATH}`);
    process.exit(1);
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  const attendance = (db.attendanceLogs || []).map((l) => ({
    ...l,
    result: "SUCCESS",
  }));
  const antiSpoof = db.antiSpoofLogs || [];

  const merged = [...attendance, ...antiSpoof]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);

  if (merged.length === 0) {
    console.log("로그가 없습니다.");
    return;
  }

  const rows = merged.map((l) => ({
    timestamp: fmtTime(l.timestamp),
    result: l.result || "-",
    isReal: fmtIsReal(l.deepfaceIsReal),
    antispoof: fmtNum(l.deepfaceAntispoofScore, 4),
    matchDist: fmtNum(l.matchDistance, 4),
    jitter: fmtNum(l.jitterScore, 2),
    blink: l.blinkDetected === true ? "Y" : l.blinkDetected === false ? "N" : "-",
    synth: l.syntheticScore != null ? String(l.syntheticScore) : "-",
    challengeSeq: fmtChallengeSeq(l.challengeSequence),
  }));

  const columns = [
    { key: "timestamp", label: "timestamp" },
    { key: "result", label: "result" },
    { key: "isReal", label: "isReal" },
    { key: "antispoof", label: "antispoof" },
    { key: "matchDist", label: "matchDist" },
    { key: "jitter", label: "jitter" },
    { key: "blink", label: "blink" },
    { key: "synth", label: "synth" },
    { key: "challengeSeq", label: "challengeSeq" },
  ];
  printTable(columns, rows);

  // 요약 통계 (매칭 시도한 로그만 대상)
  const withDist = merged.filter((l) => typeof l.matchDistance === "number");
  if (withDist.length > 0) {
    const dists = withDist.map((l) => l.matchDistance);
    const min = Math.min(...dists);
    const max = Math.max(...dists);
    const avg = dists.reduce((s, x) => s + x, 0) / dists.length;
    const lo = MATCH_THRESHOLD - NEAR_BAND;
    const hi = MATCH_THRESHOLD + NEAR_BAND;
    const nearThreshold = withDist.filter(
      (l) => l.matchDistance >= lo && l.matchDistance <= hi
    ).length;

    console.log();
    console.log(`총 ${merged.length}개 로그 표시 (matchDistance 유효: ${withDist.length}개)`);
    console.log(
      `matchDistance  min=${min.toFixed(4)}  max=${max.toFixed(4)}  ` +
        `avg=${avg.toFixed(4)}  임계값(${MATCH_THRESHOLD}) 근처` +
        `(${lo.toFixed(2)}~${hi.toFixed(2)}): ${nearThreshold}개`
    );
  }
}

function fmtTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtIsReal(v) {
  if (v === true) return "REAL";
  if (v === false) return "SPOOF";
  return "-";
}

function fmtNum(v, digits) {
  if (typeof v !== "number" || Number.isNaN(v)) return "-";
  return v.toFixed(digits);
}

// ["left","right"] -> "L>R", ["left","left"] -> "L>L" 등. 랜덤 시퀀스 도입(2026-08-04) 이전
// 로그에는 필드가 없으므로 "-" 로 표시.
function fmtChallengeSeq(seq) {
  if (!Array.isArray(seq) || seq.length === 0) return "-";
  return seq.map((d) => (d === "left" ? "L" : d === "right" ? "R" : "?")).join(">");
}

function printTable(columns, rows) {
  const widths = columns.map((c) =>
    Math.max(c.label.length, ...rows.map((r) => String(r[c.key]).length))
  );
  const sep = "+" + widths.map((w) => "-".repeat(w + 2)).join("+") + "+";
  const line = (vals) =>
    "|" + vals.map((v, i) => " " + String(v).padEnd(widths[i]) + " ").join("|") + "|";
  console.log(sep);
  console.log(line(columns.map((c) => c.label)));
  console.log(sep);
  for (const r of rows) console.log(line(columns.map((c) => r[c.key])));
  console.log(sep);
}

main();
