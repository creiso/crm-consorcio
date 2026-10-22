import { NextResponse } from "next/server";
import { db, STATUSES } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supa = db();
  const [leads, vendedores] = await Promise.all([
    supa.from("leads").select("*, vendedores(nome)").order("updated_at", { ascending: false }).limit(2000),
    supa.from("vendedores").select("id, nome").eq("ativo", true).order("nome"),
  ]);
  if (leads.error) return NextResponse.json({ error: leads.error.message }, { status: 500 });
  return NextResponse.json({ leads: leads.data, vendedores: vendedores.data ?? [] });
}

// Move o lead de coluna no kanban (a etapa "venda" é feita via /api/vendas).
export async function PATCH(req: Request) {
  const { id, status } = await req.json();
  if (!STATUSES.some((s) => s.id === status) || status === "venda")
    return NextResponse.json({ error: "status inválido" }, { status: 400 });
  const { error } = await db().from("leads").update({ status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
