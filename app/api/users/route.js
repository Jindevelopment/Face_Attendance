import { NextResponse } from "next/server";
import { getUsers, addUser, deleteUser } from "@/lib/db";

export async function GET() {
  const users = getUsers();
  return NextResponse.json({ users });
}

export async function POST(request) {
  const body = await request.json();
  const { name, guardianContact, descriptor } = body;

  if (!name || !descriptor || !Array.isArray(descriptor)) {
    return NextResponse.json(
      { error: "name과 descriptor(얼굴 특징 벡터)는 필수입니다." },
      { status: 400 }
    );
  }

  const user = {
    id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    guardianContact: guardianContact || "",
    descriptor, // Float32Array를 클라이언트에서 Array로 변환하여 전달
    createdAt: new Date().toISOString(),
  };

  addUser(user);
  return NextResponse.json({ user }, { status: 201 });
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
  }
  deleteUser(id);
  return NextResponse.json({ ok: true });
}
