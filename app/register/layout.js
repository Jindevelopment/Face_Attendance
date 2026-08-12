import { requireAdminPage } from "@/lib/requireAdmin";

// /register 는 클라이언트 컴포넌트라 인가 확인을 넣을 수 없어, 서버 레이아웃에서 감싼다.
// 얼굴 등록은 이 앱에서 가장 위험한 동작이다. 열려 있으면 아무나 자기 얼굴을 새 사용자로
// 등록한 뒤 출석까지 찍을 수 있다.
export const dynamic = "force-dynamic";

export default async function RegisterLayout({ children }) {
  await requireAdminPage("/register");
  return children;
}
