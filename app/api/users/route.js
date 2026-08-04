import { NextResponse } from "next/server";
import { getUsers, addUser, deleteUser } from "@/lib/db";

export async function GET() {
  const users = getUsers();
  return NextResponse.json({ users });
}

export async function POST(request) {
  const body = await request.json();
  const { name, guardianContact, embedding } = body;

  if (!name || !embedding || !Array.isArray(embedding) || embedding.length === 0) {
    return NextResponse.json(
      { error: "name 과 embedding(DeepFace Facenet512 벡터) 는 필수입니다." },
      { status: 400 }
    );
  }

  const user = {
    id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    guardianContact: guardianContact || "",
    embedding, // 512차원 float 배열 (Facenet512)
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
