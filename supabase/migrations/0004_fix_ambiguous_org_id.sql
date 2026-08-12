-- join_organization / create_organization 의 "column reference is ambiguous" 수정
--
-- 증상:
--   올바른 인증코드로 참여하면 `column reference "org_id" is ambiguous` 로 실패했다.
--   틀린 코드는 그 전(invalid_code)에서 걸려 나가므로 드러나지 않았고, 맞는 코드를
--   넣는 경로에서만 터졌다. 즉 아무도 조직에 참여할 수 없었다.
--
-- 원인:
--   returns table (org_id uuid, ...) 로 선언하면 org_id 가 함수 안의 변수가 된다.
--   그 상태에서 memberships.org_id 를 표현식으로 참조하면
--   (예: on conflict (user_id, org_id)) PL/pgSQL 이 변수와 컬럼을 구분하지 못한다.
--
-- 대응:
--   반환 컬럼 이름을 테이블 컬럼과 겹치지 않게 바꾼다(o_ 접두사).
--   충돌 지점 한 곳만 고치면 같은 실수가 다음에 또 난다. 이름 규칙으로 막는다.
--   호출부(app/api/org/route.js)도 새 이름을 읽도록 함께 바꿨다.

-- 반환 시그니처가 바뀌므로 먼저 지운다 (create or replace 로는 못 바꾼다).
drop function if exists public.create_organization(text);
drop function if exists public.join_organization(text);

create function public.create_organization(org_name text)
returns table (o_org_id uuid, o_join_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  new_code     text;
  new_org      uuid;
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

create function public.join_organization(code text)
returns table (o_org_id uuid, o_org_name text)
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
  from public.organizations o
  where o.join_code = upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'));

  if not found then
    raise exception 'invalid_code';
  end if;

  select email into caller_email from auth.users where id = uid;

  -- 이미 속해 있으면 역할을 낮추지 않는다 (관리자가 자기 코드를 넣어도 admin 유지).
  -- on conflict 의 컬럼 목록이 변수와 충돌하던 자리라, 제약 이름으로 지정한다.
  insert into public.memberships (user_id, org_id, role, email)
  values (uid, target.id, 'member', caller_email)
  on conflict on constraint memberships_pkey do nothing;

  return query select target.id, target.name;
end;
$$;
