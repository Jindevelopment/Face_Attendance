-- 조직(멀티테넌트) 도입
--
-- 배경:
--   0002 까지는 admins 테이블에 행이 있으면 관리자, 없으면 아무것도 못 하는 구조였다.
--   최초 관리자는 사람이 SQL 을 직접 실행해서 넣어야 했다. 가입 = 관리자로 두면
--   아무나 가입해서 등록자 전원의 정보를 볼 수 있었기 때문이다.
--
--   이제 데이터가 조직 단위로 갈린다. 가입자는 자기 조직만 볼 수 있으므로,
--   "가입하면 자기 조직의 관리자가 된다" 로 자동화해도 남의 데이터가 새지 않는다.
--   SQL 수동 실행 단계가 사라진다.
--
-- 구조:
--   organizations  조직. 인증코드(join_code)를 가진다.
--   memberships    누가 어느 조직의 admin/member 인지. 한 사람이 여러 조직에 속할 수 있다.
--   users / attendance_logs / anti_spoof_logs 에 org_id 를 붙여 조직 밖에서 안 보이게 한다.

-- ---------------------------------------------------------------------------
-- 1. 조직
-- ---------------------------------------------------------------------------

create table if not exists public.organizations (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null check (length(trim(name)) between 1 and 60),
  -- 인증코드. 사용자가 이 코드를 입력해 조직에 참여한다.
  -- 대문자+숫자 8자리. 헷갈리는 글자(0/O, 1/I/L)는 생성 함수에서 제외한다.
  join_code  text        not null unique,
  owner_id   uuid        not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists organizations_owner_idx on public.organizations (owner_id);

-- ---------------------------------------------------------------------------
-- 2. 멤버십
-- ---------------------------------------------------------------------------

create table if not exists public.memberships (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  org_id     uuid        not null references public.organizations(id) on delete cascade,
  role       text        not null check (role in ('admin', 'member')),
  email      text        not null,
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);

create index if not exists memberships_org_idx on public.memberships (org_id);

-- ---------------------------------------------------------------------------
-- 3. 기존 테이블에 org_id 부착
-- ---------------------------------------------------------------------------

alter table public.users            add column if not exists org_id uuid references public.organizations(id) on delete cascade;
alter table public.attendance_logs  add column if not exists org_id uuid references public.organizations(id) on delete cascade;
alter table public.anti_spoof_logs  add column if not exists org_id uuid references public.organizations(id) on delete cascade;

-- 얼굴 등록을 본인 계정과 연결한다.
-- 관리자가 대신 등록하는 경우도 있어 null 을 허용한다 (계정 없는 등록자).
alter table public.users add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create index if not exists users_org_idx            on public.users (org_id);
create index if not exists attendance_logs_org_idx  on public.attendance_logs (org_id, occurred_at desc);
create index if not exists anti_spoof_logs_org_idx  on public.anti_spoof_logs (org_id, occurred_at desc);

-- 한 사람이 같은 조직에 얼굴을 두 번 등록하지 못하게 한다.
create unique index if not exists users_org_auth_uniq
  on public.users (org_id, auth_user_id)
  where auth_user_id is not null;

-- ---------------------------------------------------------------------------
-- 4. 인증코드 생성
-- ---------------------------------------------------------------------------

-- 0/O, 1/I/L 처럼 눈으로 구분이 어려운 글자를 뺀다.
-- 코드는 사람이 받아적고 입력하는 값이라, 오타 한 글자가 곧 가입 실패가 된다.
create or replace function public.generate_join_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
begin
  loop
    candidate := '';
    for i in 1..8 loop
      candidate := candidate || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
    end loop;
    -- 중복이면 다시 뽑는다.
    exit when not exists (select 1 from public.organizations where join_code = candidate);
  end loop;
  return candidate;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. 조직 생성 / 참여 (로그인한 사용자가 직접 호출)
-- ---------------------------------------------------------------------------

-- 관리자 가입: 조직을 만들고 본인을 admin 으로 등록한다.
-- security definer 로 두는 이유는 organizations/memberships 에 쓰기 정책을 열지 않기 위해서다.
-- 정책을 열면 남의 조직 행을 조작할 여지가 생긴다. 쓰기는 이 함수를 통해서만 일어난다.
create or replace function public.create_organization(org_name text)
returns table (org_id uuid, join_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  new_code  text;
  new_org   uuid;
  caller_email text;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if org_name is null or length(trim(org_name)) = 0 then
    raise exception 'org_name_required';
  end if;

  select email into caller_email from auth.users where id = uid;
  new_code := public.generate_join_code();

  insert into public.organizations (name, join_code, owner_id)
  values (trim(org_name), new_code, uid)
  returning id into new_org;

  insert into public.memberships (user_id, org_id, role, email)
  values (uid, new_org, 'admin', caller_email);

  return query select new_org, new_code;
end;
$$;

-- 사용자 가입: 인증코드로 조직에 member 로 참여한다.
create or replace function public.join_organization(code text)
returns table (org_id uuid, org_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  target       public.organizations%rowtype;
  caller_email text;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  -- 입력 편의: 공백과 대소문자를 흡수한다. 코드는 사람이 옮겨 적는 값이다.
  select * into target
  from public.organizations
  where join_code = upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'));

  if not found then
    raise exception 'invalid_code';
  end if;

  select email into caller_email from auth.users where id = uid;

  -- 이미 속해 있으면 역할을 낮추지 않는다 (관리자가 자기 코드를 넣어도 admin 유지).
  insert into public.memberships (user_id, org_id, role, email)
  values (uid, target.id, 'member', caller_email)
  on conflict (user_id, org_id) do nothing;

  return query select target.id, target.name;
end;
$$;

-- 인증코드 재발급. 코드가 외부로 샜을 때 관리자가 끊어낼 수 있어야 한다.
create or replace function public.rotate_join_code(target_org uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  new_code text;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (
    select 1 from public.memberships
    where user_id = uid and org_id = target_org and role = 'admin'
  ) then
    raise exception 'not_admin';
  end if;

  new_code := public.generate_join_code();
  update public.organizations set join_code = new_code where id = target_org;
  return new_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. 권한 조회 헬퍼
-- ---------------------------------------------------------------------------

-- 로그인한 사용자의 소속 목록. 서버가 세션당 한 번 호출한다.
create or replace function public.my_memberships()
returns table (org_id uuid, org_name text, role text, join_code text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, m.role,
         -- 인증코드는 관리자에게만 보인다. member 에게 노출하면 그 사람이 코드를
         -- 퍼뜨려 조직이 열린다.
         case when m.role = 'admin' then o.join_code else null end
  from public.memberships m
  join public.organizations o on o.id = m.org_id
  where m.user_id = auth.uid()
  order by m.created_at;
$$;

-- 0002 의 is_admin 은 "전역 관리자" 개념이라 더 이상 맞지 않는다.
-- 조직을 지정해서 묻도록 바꾼다.
create or replace function public.is_org_admin(uid uuid, target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where user_id = uid and org_id = target_org and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- 7. 조직 범위 얼굴 매칭
-- ---------------------------------------------------------------------------

-- 0001 의 match_face 는 전체 users 를 훑는다. 조직이 생긴 뒤에는 남의 조직 사람과
-- 매칭되면 안 되므로 org_id 로 좁힌 버전을 쓴다.
create or replace function public.match_face_in_org(
  target_org      uuid,
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
  select u.id, u.name, (u.embedding <=> query_embedding) as distance
  from public.users u
  where u.org_id = target_org
    and (u.embedding <=> query_embedding) <= match_threshold
  order by u.embedding <=> query_embedding
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.memberships   enable row level security;

-- 조직 정보는 소속된 사람만 읽는다.
drop policy if exists "소속 조직만 조회" on public.organizations;
create policy "소속 조직만 조회"
  on public.organizations for select
  to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.org_id = organizations.id and m.user_id = auth.uid()
  ));

-- 본인 멤버십만 읽는다. 같은 조직의 다른 사람 목록은 서버(service_role)가 조회한다.
drop policy if exists "본인 멤버십만 조회" on public.memberships;
create policy "본인 멤버십만 조회"
  on public.memberships for select
  to authenticated
  using (user_id = auth.uid());

-- users / attendance_logs / anti_spoof_logs 는 0001 에서 정책 없이 RLS 를 켜 뒀다.
-- anon/authenticated 키로는 한 줄도 읽히지 않고, 서버만 service_role 로 접근한다.
-- 조직 격리는 서버 코드가 org_id 로 좁혀서 보장한다. 그대로 유지한다.

-- ---------------------------------------------------------------------------
-- 9. 기존 데이터 이관
-- ---------------------------------------------------------------------------
-- 0002 의 admins 에 있던 사람을 조직 소유자로 옮긴다.
-- admins 가 비어 있으면 아무 일도 하지 않는다.

do $$
declare
  first_admin  record;
  new_org      uuid;
  new_code     text;
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'admins') then
    return;
  end if;
  if exists (select 1 from public.organizations) then
    return; -- 이미 이관됨
  end if;

  select * into first_admin from public.admins order by created_at limit 1;
  if not found then
    return;
  end if;

  new_code := public.generate_join_code();
  insert into public.organizations (name, join_code, owner_id)
  values ('기본 조직', new_code, first_admin.user_id)
  returning id into new_org;

  insert into public.memberships (user_id, org_id, role, email)
  select a.user_id, new_org, 'admin', a.email from public.admins a
  on conflict do nothing;

  -- 기존 얼굴/로그 데이터를 이 조직 소유로 붙인다.
  update public.users           set org_id = new_org where org_id is null;
  update public.attendance_logs set org_id = new_org where org_id is null;
  update public.anti_spoof_logs set org_id = new_org where org_id is null;

  raise notice '기존 admins 를 조직으로 이관했습니다. 인증코드: %', new_code;
end $$;
