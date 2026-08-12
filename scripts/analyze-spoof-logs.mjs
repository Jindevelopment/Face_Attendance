#!/usr/bin/env node
// 출결/이상탐지 로그 분석용 스크립트.
//
// SUCCESS 는 attendance_logs 에, REJECTED_* 는 anti_spoof_logs 에 들어가므로
// 둘을 합쳐야 전체 흐름이 보인다.
//
// 사용법 (환경변수가 필요하므로 --env-file 을 반드시 붙인다):
//   node --env-file=.env.local scripts/analyze-spoof-logs.mjs         # 최근 10개
//   node --env-file=.env.local scripts/analyze-spoof-logs.mjs 30      # 최근 30개
//   node --env-file=.env.local scripts/analyze-spoof-logs.mjs --all   # 전부

import { createClient } from "@supabase/supabase-js";
import { FACENET512_COSINE_THRESHOLD } from "../lib/vectorMath.js";

// 임계값 ±BAND 구간 = "아슬아슬하게 갈린" 로그. 많으면 임계값 재보정 신호.
const NEAR_BAND = 0.05;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "환경변수가 없습니다. 다음처럼 실행하세요:\n" +
      "  node --env-file=.env.local scripts/analyze-spoof-logs.mjs"
  );
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const argv = process.argv.slice(2);
const all = argv.includes("--all");
const nArg = argv.find((a) => /^\d+$/.test(a));
const limit = all ? 100000 : nArg ? parseInt(nArg, 10) : 10;

// 두 테이블에서 각각 limit 개를 가져와 합친 뒤 다시 자른다.
// (한쪽에 쏠려 있어도 최신 limit 개가 정확히 나오도록)
const [att, spoof] = await Promise.all([
  sb
    .from("attendance_logs")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(limit),
  sb
    .from("anti_spoof_logs")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(limit),
]);

for (const [name, res] of [
  ["attendance_logs", att],
  ["anti_spoof_logs", spoof],
]) {
  if (res.error) {
    console.error(`${name} 조회 실패: ${res.error.message}`);
    process.exit(1);
  }
}

const merged = [
  ...(att.data ?? []).map((l) => ({ ...l, result: "SUCCESS" })),
  ...(spoof.data ?? []),
]
  .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))
  .slice(0, limit);

if (merged.length === 0) {
  console.log("로그가 없습니다.");
  process.exit(0);
}

const rows = merged.map((l) => ({
  timestamp: fmtTime(l.occurred_at),
  result: l.result || "-",
  isReal: fmtIsReal(l.deepface_is_real),
  antispoof: fmtNum(l.deepface_antispoof_score, 4),
  matchDist: fmtNum(l.match_distance, 4),
  jitter: fmtNum(l.jitter_score, 2),
  blink: l.blink_detected === true ? "Y" : l.blink_detected === false ? "N" : "-",
  synth: l.synthetic_score != null ? String(l.synthetic_score) : "-",
  challengeSeq: fmtChallengeSeq(l.challenge_sequence),
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
const withDist = merged.filter((l) => typeof l.match_distance === "number");
if (withDist.length > 0) {
  const dists = withDist.map((l) => l.match_distance);
  const min = Math.min(...dists);
  const max = Math.max(...dists);
  const avg = dists.reduce((s, x) => s + x, 0) / dists.length;
  const lo = FACENET512_COSINE_THRESHOLD - NEAR_BAND;
  const hi = FACENET512_COSINE_THRESHOLD + NEAR_BAND;
  const nearThreshold = withDist.filter(
    (l) => l.match_distance >= lo && l.match_distance <= hi
  ).length;

  console.log();
  console.log(`총 ${merged.length}개 로그 표시 (matchDistance 유효: ${withDist.length}개)`);
  console.log(
    `matchDistance  min=${min.toFixed(4)}  max=${max.toFixed(4)}  ` +
      `avg=${avg.toFixed(4)}  임계값(${FACENET512_COSINE_THRESHOLD}) 근처` +
      `(${lo.toFixed(2)}~${hi.toFixed(2)}): ${nearThreshold}개`
  );
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
