// Supabase 가 돌려주는 영어 메시지를 사용자 문구로 옮긴다.
//
// 원문을 그대로 보여주면 "내가 뭘 잘못했는지" 와 "기다리면 되는지" 를 구분할 수 없다.
// 특히 rate limit 은 사용자 잘못이 아니라 잠시 후 다시 하면 되는 상황인데,
// "email rate limit exceeded" 만으로는 그 사실이 전달되지 않는다.

export function translateAuthError(message = "") {
  if (/Invalid login credentials/i.test(message)) {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }
  if (/Email not confirmed/i.test(message)) {
    return "이메일 확인이 아직 끝나지 않았습니다. 받은 메일의 링크를 눌러주세요.";
  }
  // 메일 발송 자체가 실패한 경우. Supabase 기본 메일은 하루 몇 통 수준이라
  // 개발 중에도 금방 막힌다. 사용자가 아무리 다시 눌러도 풀리지 않으므로,
  // 관리자에게 알리라고 안내해야 한다.
  if (/Error sending confirmation email|error sending email/i.test(message)) {
    return (
      "확인 메일을 보내지 못했습니다. 계정은 만들어지지 않았으니 다시 시도하셔도 됩니다. " +
      "계속 같은 오류가 나면 관리자에게 알려주세요 (메일 발송 설정이 필요합니다)."
    );
  }
  if (/rate limit/i.test(message)) {
    return (
      "메일 발송 한도에 걸렸습니다. 사용자 잘못이 아니라 발송 서버 제한이니, " +
      "잠시 후 다시 시도해주세요."
    );
  }
  if (/already registered|already been registered/i.test(message)) {
    return "이미 가입된 이메일입니다. 로그인해주세요.";
  }
  if (/is invalid/i.test(message)) {
    return "사용할 수 없는 이메일 주소입니다. 실제로 받을 수 있는 주소를 입력해주세요.";
  }
  if (/Password should be at least/i.test(message)) {
    return "비밀번호가 너무 짧습니다. 8자 이상으로 만들어주세요.";
  }
  if (/For security purposes/i.test(message)) {
    return "잠시 후 다시 시도해주세요. 연속 요청이 제한되었습니다.";
  }
  return message;
}

export const MIN_PASSWORD = 8;

// 가입 폼 3개(관리자/참여자)가 같은 검사를 반복하지 않도록 모아둔다.
export function validateSignupForm({ email, password, confirm }) {
  if (!email) return "이메일을 입력해주세요.";
  if (password.length < MIN_PASSWORD) {
    return `비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다.`;
  }
  if (password !== confirm) return "비밀번호가 일치하지 않습니다.";
  return null;
}

// 인증코드는 사람이 받아적어 옮기는 값이다. 공백·하이픈·소문자를 흡수한다.
export function normalizeJoinCode(raw) {
  return (raw || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}
