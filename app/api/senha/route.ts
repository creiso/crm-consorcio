import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { perfilApi } from "@/lib/auth";

export const dynamic = "force-dynamic";

// "Esqueci minha senha": público. Registra o pedido para o admin (notificação na tela Equipes).
// A resposta é sempre a mesma, exista ou não o e-mail, para não revelar quem tem acesso.
export async function POST(req: Request) {
  const email = String((await req.json().catch(() => ({}))).email ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Digite um e-mail válido" }, { status: 400 });

  const supa = db();
  const { data: usuario } = await supa.from("vendedores").select("id").eq("email", email).eq("ativo", true).maybeSingle();
  if (usuario) {
    // um pedido em aberto por pessoa basta
    const { count, error } = await supa.from("pedidos_senha").select("id", { count: "exact", head: true })
      .eq("vendedor_id", usuario.id).is("resolvido_em", null);
    if (error) return NextResponse.json({ error: "Não foi possível enviar o pedido. Avise o administrador." }, { status: 500 });
    if (!count) await supa.from("pedidos_senha").insert({ vendedor_id: usuario.id });
  }
  return NextResponse.json({ ok: true });
}

// Pedidos em aberto, para o admin (tela Equipes).
export async function GET() {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const { data, error } = await db().from("pedidos_senha")
    .select("id, created_at, vendedor_id, vendedores(nome, email, foto_url, papel)")
    .is("resolvido_em", null).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ pedidos: [], sqlFaltando: true });
  return NextResponse.json({ pedidos: data ?? [] });
}

// Dispensar um pedido sem trocar a senha (ex.: a pessoa lembrou).
export async function PATCH(req: Request) {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const { id } = await req.json();
  await db().from("pedidos_senha").update({ resolvido_em: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true });
}
