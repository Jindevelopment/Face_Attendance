-- FaceGate 초기 스키마
--
-- data/db.json (파일 기반 데모 저장소) 을 대체한다.
-- 컬럼명은 snake_case, 애플리케이션(JS) 쪽 camelCase 매핑은 lib/db.js 가 담당한다.
--
-- 중요: users.embedding 은 얼굴 생체정보(개인정보보호법상 민감정보)다.
--       브라우저에서 직접 접근하면 안 되며, 아래 RLS 설정으로 anon/authenticated
--       역할의 접근을 전면 차단한다. 서버(Next.js API 라우트)는 RLS 를 우회하는
--       service_role 키로만 접근할 것.

-- ---------------------------------------------------------------------------
-- 확장
-- ---------------------------------------------------------------------------
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id               text        primary key,
  name             text        not null,
  guardian_contact text        not null default '',
  -- Facenet512 임베딩. vector(512) 로 두면 차원이 DB 레벨에서 강제되어,
  -- 잘못된 길이의 배열이 등록되는 것을 애플리케이션 검증과 무관하게 막는다.
  embedding        vector(512) not null,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- attendance_logs — 출결 성공 기록
-- ---------------------------------------------------------------------------
create table if not exists public.attendance_logs (
  id                       text        primary key,
  -- 사용자가 삭제돼도 출결 이력은 남긴다 (감사 목적). 이름은 별도 보존.
  user_id                  text        references public.users(id) on delete set null,
  name                     text,
  occurred_at              timestamptz not null default now(),
  liveness_passed          boolean,
  blink_detected           boolean,     -- 진단용 (판정에 미사용)
  jitter_score             double precision, -- 진단용 (판정에 미사용)
  synthetic_score          integer,
  match_distance           double precision, -- cosine distance
  deepface_is_real         boolean,
  deepface_antispoof_score double precision,
  challenge_sequence       text[]       -- 예: {right,right}
);

create index if not exists attendance_logs_occurred_at_idx
  on public.attendance_logs (occurred_at desc);

-- hasRecentAttendance(userId, withinMinutes) 조회용
create index if not exists attendance_logs_user_occurred_idx
  on public.attendance_logs (user_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- anti_spoof_logs — 위조 판별 실패 / 매칭 실패 기록
-- ---------------------------------------------------------------------------
create table if not exists public.anti_spoof_logs (
  id                       text        primary key,
  occurred_at              timestamptz not null default now(),
  result                   text        not null,  -- REJECTED_SPOOF | REJECTED_NO_MATCH
  reason                   text,
  liveness_passed          boolean,
  blink_detected           boolean,
  jitter_score             double precision,
  synthetic_score          integer,
  match_distance           double precision,
  deepface_is_real         boolean,
  deepface_antispoof_score double precision,
  challenge_sequence       text[],
  -- 매칭 실패 시 사용자가 주장한 신원 (있는 경우)
  claimed_user_id          text,
  claimed_name             text
);

create index if not exists anti_spoof_logs_occurred_at_idx
  on public.anti_spoof_logs (occurred_at desc);

-- ---------------------------------------------------------------------------
-- 얼굴 매칭 함수
-- ---------------------------------------------------------------------------
-- 매칭을 SQL 로 옮긴다. 기존 JS 구현은 전체 사용자를 메모리로 불러와 루프를 돌았다.
--
-- <=> 는 pgvector 의 cosine distance 연산자로, lib/vectorMath.js 의
-- cosineDistance() 와 같은 정의(1 - cos)다. 두 구현이 실제로 일치하는지는
-- 교체 시 회귀 테스트로 대조할 것.
--
-- 벡터 인덱스(HNSW/IVFFlat)는 의도적으로 만들지 않았다. 둘 다 근사 검색이라
-- 최근접 이웃을 놓칠 수 있는데, 출결 시스템에서는 그 오차가 곧 오인식이다.
-- 사용자 수가 수천 명대로 커지기 전까지는 정확한 전수 스캔이 빠르고 안전하다.
create or replace function public.match_face(
  query_embedding vector(512),
  match_threshold double precision default 0.25
)
returns table (
  id       text,
  name     text,
  distance double precision
)
language sql
stable
as $$
  select u.id,
         u.name,
         (u.embedding <=> query_embedding)::double precision as distance
  from public.users u
  where (u.embedding <=> query_embedding) < match_threshold
  order by u.embedding <=> query_embedding
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- RLS — 기본 차단
-- ---------------------------------------------------------------------------
-- 정책(policy)을 하나도 만들지 않은 채 RLS 를 켜면 anon / authenticated 역할은
-- 어떤 행도 읽거나 쓸 수 없다. service_role 키는 RLS 를 우회하므로 서버에서만
-- 동작한다. 브라우저에 anon 키가 노출되더라도 얼굴 임베딩은 조회되지 않는다.
alter table public.users            enable row level security;
alter table public.attendance_logs  enable row level security;
alter table public.anti_spoof_logs  enable row level security;

-- match_face 도 서버 전용이므로 anon 실행 권한을 회수한다.
revoke all on function public.match_face(vector, double precision) from anon, authenticated;
