import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { perfilApi } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Equipes com seus membros ativos (coordenadores e vendedores). Só o admin gerencia equipes.
export async function GET() {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const supa = db();
  const [{ data: equipes }, { data: membros }] = await Promise.all([
    supa.from("equipes").select("id, nome, created_at").order("nome"),
    supa.from("vendedores").select("id, nome, foto_url, papel, equipe_id").eq("ativo", true).not("equipe_id", "is", null).order("nome"),
  ]);
  return NextResponse.json((equipes ?? []).map((e) => ({ ...e, membros: (membros ?? []).filter((m) => m.equipe_id === e.id) })));
}

export async function POST(req: Request) {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const nome = String((await req.json()).nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "Dê um nome para a equipe" }, { status: 400 });
  const { data, error } = await db().from("equipes").insert({ nome }).select().single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "Já existe uma equipe com esse nome" : error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const { id, nome } = await req.json();
  if (!String(nome ?? "").trim()) return NextResponse.json({ error: "Dê um nome para a equipe" }, { status: 400 });
  const { error } = await db().from("equipes").update({ nome: String(nome).trim() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.code === "23505" ? "Já existe uma equipe com esse nome" : error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// Excluir: membros ficam sem equipe; leads e vendas continuam no sistema (sem equipe).
export async function DELETE(req: Request) {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const { id } = await req.json();
  const supa = db();
  // tira a equipe das planilhas que distribuíam para ela
  const { data: planilhas } = await supa.from("planilhas").select("id, equipes").contains("equipes", [id]);
  for (const pl of planilhas ?? [])
    await supa.from("planilhas").update({ equipes: (pl.equipes as string[]).filter((e) => e !== id) }).eq("id", pl.id);
  const { error } = await supa.from("equipes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
