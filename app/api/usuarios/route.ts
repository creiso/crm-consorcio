import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { perfilApi } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const { data } = await db().from("vendedores").select("id, nome, email, papel, ativo").order("nome");
  return NextResponse.json(data ?? []);
}

// Admin cria o acesso de um vendedor (ou outro admin) com e-mail e senha inicial.
export async function POST(req: Request) {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const { nome, email, senha, papel } = await req.json();
  if (!nome || !email || (senha ?? "").length < 8)
    return NextResponse.json({ error: "Nome, e-mail e senha (mín. 8 caracteres) são obrigatórios" }, { status: 400 });

  const supa = db();
  const { data: u, error } = await supa.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { error: e2 } = await supa.from("vendedores")
    .insert({ nome, email: email.toLowerCase(), papel: papel === "admin" ? "admin" : "vendedor", user_id: u.user.id });
  if (e2) {
    await supa.auth.admin.deleteUser(u.user.id);
    return NextResponse.json({ error: e2.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// Ativar/desativar acesso (não apaga histórico de vendas).
export async function PATCH(req: Request) {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const { id, ativo } = await req.json();
  if (id === p.id) return NextResponse.json({ error: "Você não pode desativar a si mesmo" }, { status: 400 });
  await db().from("vendedores").update({ ativo }).eq("id", id);
  return NextResponse.json({ ok: true });
}
