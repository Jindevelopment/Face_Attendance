# 확인 메일 보내기 (SMTP 연결)

가입할 때 Supabase 가 확인 메일을 보냅니다. 기본 설정으로는 **시간당 2~3건**밖에 못 보내서,
사람 몇 명만 가입해도 `메일 발송 한도에 걸렸습니다` 가 뜹니다.

이건 코드 문제가 아니라 **Supabase 프로젝트 설정**입니다. 아래는 사용자가 직접 해야 합니다
(API 키를 다루는 일이라 대신 넣어드리지 않습니다).

---

## 1. Resend 에서 API 키 만들기

1. [resend.com](https://resend.com) 가입
2. **API Keys → Create API Key**
3. 만들어진 키(`re_` 로 시작)를 복사

> 무료 한도는 하루 100건입니다. 도메인이 없으면 발신 주소로
> `onboarding@resend.dev` 를 쓸 수 있습니다. 이건 테스트용이고, 실제로 쓸 때는
> **Domains** 메뉴에서 본인 도메인을 인증해 `noreply@내도메인` 으로 바꾸세요.

---

## 2. Supabase 에 연결

Supabase 대시보드 → **Authentication → Emails → SMTP Settings** → *Enable Custom SMTP*

| 항목 | 값 |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | 1번에서 복사한 `re_...` 키 |
| Sender email | `onboarding@resend.dev` (또는 인증한 본인 도메인 주소) |
| Sender name | `FaceGate` |

저장하면 끝입니다. 코드는 고칠 게 없습니다.

---

## 3. 발송 한도 올리기

**Authentication → Rate Limits → Rate limit for sending emails**

기본값이 시간당 2건입니다. Resend 무료 한도(하루 100건)에 맞춰
**시간당 30건** 정도로 올려두면 실사용에 충분합니다.

---

## 4. 확인

`/join` 이나 `/admin/signup` 에서 실제로 받을 수 있는 주소로 가입해보세요.
메일이 오면 성공입니다.

메일이 안 오면 Resend 대시보드의 **Logs** 에서 발송 시도가 찍혔는지 봅니다.
- 기록이 있는데 안 왔다 → 스팸함 확인, 발신 도메인 인증 상태 확인
- 기록이 없다 → Supabase SMTP 설정이 저장되지 않았거나 키가 틀림

---

## 참고: 개발 중에 메일을 아예 끄고 싶다면

**Authentication → Sign In / Providers → Email → Confirm email** 을 끄면 가입 즉시
로그인됩니다. 개발이 빨라지지만 **남의 이메일로 가입하는 걸 막지 못하므로**
실제 서비스에서는 반드시 다시 켜야 합니다.

이 설정을 끄면 `/admin/signup` 과 `/join` 에서 조직 생성·참여가 가입 즉시 이어집니다
(세션이 바로 생기기 때문). 켜져 있으면 확인 메일을 누르고 로그인한 뒤 `/start` 에서
이어집니다. 두 경로 모두 동작합니다.
