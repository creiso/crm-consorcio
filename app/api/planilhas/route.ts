import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { perfilApi } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Para quais equipes a planilha distribui (lista vazia = todas) e se é automática (roleta) ou manual.
// "roleta" acompanha o modo para o SQL antigo continuar coerente.
function distribuicao(body: { modo?: string; equipes?: unknown }) {
  const modo = body.modo === "manual" ? "manual" : "automatica";
  const equipes = Array.isArray(body.equipes) ? body.equipes.filter((e): e is string => typeof e === "string") : [];
  return { modo, equipes, roleta: modo === "automatica", vendedor_padrao_id: null };
}

export async function GET() {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const { data } = await db().from("planilhas").select("*").order("created_at");
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const body = await req.json();
  if (!body.nome || !/^https:\/\/docs\.google\.com\/spreadsheets\//.test(body.csv_url ?? ""))
    return NextResponse.json({ error: "Informe um nome e o link da planilha do Google Sheets" }, { status: 400 });
  const { data, error } = await db().from("planilhas")
    .insert({ nome: body.nome, csv_url: body.csv_url, ...distribuicao(body) }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const body = await req.json();
  const { error } = await db().from("planilhas").update({ ativo: !!body.ativo, ...distribuicao(body) }).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const { id } = await req.json();
  await db().from("planilhas").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
