import { NextResponse } from "next/server";
import { db, STATUSES } from "@/lib/supabase";
import { perfilApi } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Admin vê todos os leads; vendedor só os ligados a ele.
export async function GET() {
  const p = await perfilApi();
  if (p instanceof NextResponse) return p;
  const supa = db();
  const query = supa.from("leads").select("*, vendedores(nome)").order("updated_at", { ascending: false }).limit(2000);
  if (p.papel !== "admin") query.eq("vendedor_id", p.id);

  const [leads, vendedores] = await Promise.all([
    query,
    supa.from("vendedores").select("id, nome").eq("ativo", true).order("nome"),
  ]);
  if (leads.error) return NextResponse.json({ error: leads.error.message }, { status: 500 });
  return NextResponse.json({
    leads: leads.data,
    vendedores: p.papel === "admin" ? vendedores.data ?? [] : [{ id: p.id, nome: p.nome }],
    perfil: p,
  });
}

// Move o lead de coluna (a etapa "venda" é feita via /api/vendas). Admin também pode trocar o vendedor.
export async function PATCH(req: Request) {
  const p = await perfilApi();
  if (p instanceof NextResponse) return p;
  const { id, status, vendedor_id } = await req.json();

  const patch: Record<string, unknown> = {};
  if (status !== undefined) {
    if (!STATUSES.some((s) => s.id === status) || status === "venda")
      return NextResponse.json({ error: "status inválido" }, { status: 400 });
    patch.status = status;
  }
  if (vendedor_id !== undefined) {
    if (p.papel !== "admin") return NextResponse.json({ error: "apenas administradores" }, { status: 403 });
    patch.vendedor_id = vendedor_id || null;
  }

  const query = db().from("leads").update(patch).eq("id", id);
  if (p.papel !== "admin") query.eq("vendedor_id", p.id);
  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
