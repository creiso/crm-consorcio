import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

// Cria o PRIMEIRO administrador. Fica bloqueado assim que existir um admin.
export async function POST(req: Request) {
  const supa = db();
  const { count } = await supa.from("vendedores").select("id", { count: "exact", head: true }).eq("papel", "admin");
  if (count) return NextResponse.json({ error: "Já existe um administrador. Faça login." }, { status: 403 });

  const { nome, email, senha } = await req.json();
  if (!nome || !email || (senha ?? "").length < 8)
    return NextResponse.json({ error: "Nome, e-mail e senha (mín. 8 caracteres) são obrigatórios" }, { status: 400 });

  const { data: u, error } = await supa.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { error: e2 } = await supa.from("vendedores")
    .insert({ nome, email: email.toLowerCase(), papel: "admin", user_id: u.user.id });
  if (e2) {
    await supa.auth.admin.deleteUser(u.user.id);
    return NextResponse.json({ error: e2.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
