import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabaseAuth";

// GET 으로 로그아웃하면 링크 프리페치나 이미지 태그만으로도 세션이 끊길 수 있어
// POST 만 받는다.
export async function POST(request) {
  const cookieStore = await cookies();
  const supabase = createServerSupabase(cookieStore);
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
