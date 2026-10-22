import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { perfilApi } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const { data } = await db().from("planilhas").select("*, vendedores(nome)").order("created_at");
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const { nome, csv_url, vendedor_padrao_id } = await req.json();
  if (!nome || !/^https:\/\/docs\.google\.com\/spreadsheets\//.test(csv_url ?? ""))
    return NextResponse.json({ error: "Informe um nome e o link CSV publicado do Google Sheets" }, { status: 400 });
  const { data, error } = await db().from("planilhas")
    .insert({ nome, csv_url, vendedor_padrao_id: vendedor_padrao_id || null }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const { id, ativo, vendedor_padrao_id } = await req.json();
  const { error } = await db().from("planilhas").update({ ativo, vendedor_padrao_id: vendedor_padrao_id || null }).eq("id", id);
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
