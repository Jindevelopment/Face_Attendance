// pgvector 의 <=> 연산자가 lib/vectorMath.js 의 cosineDistance() 와 같은 값을 내는지 확인한다.
//
// 매칭이 JS 에서 SQL 로 이동했으므로, 두 구현이 어긋나면 실측으로 보정한 임계값 0.25 가
// 의미를 잃는다. 저장된 임베딩에 잡음을 섞어 질의 벡터를 만들고, 양쪽 계산을 대조한다.
//
//   node --env-file=.env.local scripts/verify-match-parity.mjs

import { createClient } from "@supabase/supabase-js";
import { cosineDistance, FACENET512_COSINE_THRESHOLD } from "../lib/vectorMath.js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("환경변수가 없습니다. --env-file=.env.local 로 실행하세요.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

// 저장된 임베딩을 그대로 읽는다 (이 스크립트는 검증용이라 embedding 을 직접 조회한다).
const { data: users, error } = await sb.from("users").select("id, name, embedding").limit(1);
if (error) {
  console.error("조회 실패:", error.message);
  process.exit(1);
}
if (!users.length) {
  console.error("users 가 비어 있습니다. 먼저 마이그레이션을 실행하세요.");
  process.exit(1);
}

const user = users[0];
// Supabase 는 vector 컬럼을 문자열 "[0.1,0.2,...]" 로 돌려준다.
const stored =
  typeof user.embedding === "string" ? JSON.parse(user.embedding) : user.embedding;

console.log(`대상: ${user.name} (${stored.length}차원)\n`);

let failures = 0;
function compare(label, query) {
  return sb
    .rpc("match_face", { query_embedding: query, match_threshold: 2.0 })
    .then(({ data, error: rpcErr }) => {
      if (rpcErr) {
        console.log(`  ${label}: ❌ RPC 실패 ${rpcErr.message}`);
        failures++;
        return;
      }
      const js = cosineDistance(query, stored);
      const sql = data?.[0]?.distance;
      if (sql == null) {
        console.log(`  ${label}: ❌ 결과 없음 (JS=${js.toFixed(6)})`);
        failures++;
        return;
      }
      const diff = Math.abs(js - sql);
      // float4/float8 왕복 오차를 감안한 허용치.
      const ok = diff < 1e-5;
      if (!ok) failures++;
      console.log(
        `  ${label}: JS=${js.toFixed(6)}  SQL=${sql.toFixed(6)}  차이=${diff.toExponential(2)} ${ok ? "✅" : "❌"}`
      );
    });
}

// 1) 동일 벡터 → 거리 0
await compare("동일 벡터        ", [...stored]);

// 2) 잡음 크기를 키워가며 임계값 부근까지 훑는다
for (const scale of [0.05, 0.2, 0.5, 1.0]) {
  const noisy = stored.map((v) => v + (Math.random() - 0.5) * 2 * scale);
  await compare(`잡음 ±${scale.toFixed(2).padEnd(4)}     `, noisy);
}

console.log(
  `\n임계값 ${FACENET512_COSINE_THRESHOLD} 기준. ` +
    (failures === 0
      ? "✅ 두 구현이 일치합니다 — SQL 이관으로 판정이 달라지지 않습니다."
      : `❌ ${failures}건 불일치 — 임계값 재검토가 필요합니다.`)
);
process.exit(failures === 0 ? 0 : 1);
