-- 관리자 인증 (이메일/비밀번호)
--
-- 설계 요지: Supabase Auth 로 가입한 계정이 곧바로 관리자가 되지는 않는다.
--
-- 가입(signup)은 누구나 할 수 있다. 이메일만 있으면 되기 때문이다. 만약 "가입 = 관리자"
-- 로 두면 아무나 가입해서 등록자 전원의 이름·연락처·출결 기록을 볼 수 있게 된다.
-- 그래서 권한은 아래 admins 테이블에 행이 있는 계정에만 부여하고, 그 행은 사람이
-- 직접 넣는다 (아래 "첫 관리자 지정" 참고).

create table if not exists public.admins (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  email      text        not null,
  note       text,
  created_at timestamptz not null default now()
);

-- 로그인한 사용자가 자기 자신의 관리자 여부만 확인할 수 있게 한다.
-- (남이 관리자인지 조회할 필요는 없다.)
alter table public.admins enable row level security;

drop policy if exists "본인의 관리자 여부만 조회" on public.admins;
create policy "본인의 관리자 여부만 조회"
  on public.admins for select
  to authenticated
  using (user_id = auth.uid());

-- 서버 코드에서 쓰는 헬퍼. security definer 로 두어 RLS 와 무관하게 판정한다.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = uid);
$$;

-- ---------------------------------------------------------------------------
-- 첫 관리자 지정 (사람이 직접 실행)
-- ---------------------------------------------------------------------------
-- 1) 앱의 /signup 에서 이메일/비밀번호로 가입한다.
-- 2) Supabase SQL Editor 에서 아래를 실행한다 (이메일을 본인 것으로 교체):
--
--    insert into public.admins (user_id, email, note)
--    select id, email, '최초 관리자'
--    from auth.users
--    where email = 'you@example.com'
--    on conflict (user_id) do nothing;
--
-- 3) 앱에서 로그아웃 후 다시 로그인하면 /dashboard 와 /register 에 접근할 수 있다.
--
-- 관리자를 해제하려면 해당 행을 지우면 된다:
--    delete from public.admins where email = 'someone@example.com';
