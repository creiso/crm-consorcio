import { NextResponse } from "next/server";
import { db, STATUSES } from "@/lib/supabase";
import { perfilApi } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Admin vê todos os leads; vendedor só os ligados a ele.
// Cada coluna traz só os N mais recentes (?lead=50&quente=100...) e o total, para o kanban ficar leve.
export async function GET(req: Request) {
  const p = await perfilApi();
  if (p instanceof NextResponse) return p;
  const params = new URL(req.url).searchParams;
  // busca: tira caracteres que quebram o filtro do PostgREST
  const q = (params.get("q") ?? "").replace(/[,()*%]/g, " ").trim();
  const supa = db();

  const colunas = await Promise.all(
    STATUSES.map(async (s) => {
      const limite = Math.min(Math.max(Number(params.get(s.id)) || 50, 1), 1000);
      const query = supa.from("leads").select("*, vendedores(nome)", { count: "exact" })
        .eq("status", s.id).order("created_at", { ascending: false }).limit(limite);
      if (p.papel !== "admin") query.eq("vendedor_id", p.id);
      if (q) query.or(`nome.ilike.*${q}*,telefone.ilike.*${q.replace(/\D/g, "") || q}*,cidade.ilike.*${q}*,email.ilike.*${q}*`);
      const { data, count, error } = await query;
      if (error) throw new Error(error.message);
      return { status: s.id, leads: data ?? [], total: count ?? 0 };
    })
  ).catch((e: Error) => e);
  if (colunas instanceof Error) return NextResponse.json({ error: colunas.message }, { status: 500 });

  const { data: vendedores } = await supa.from("vendedores").select("id, nome").eq("ativo", true).order("nome");
  return NextResponse.json({
    leads: colunas.flatMap((c) => c.leads),
    totais: Object.fromEntries(colunas.map((c) => [c.status, c.total])),
    vendedores: p.papel === "admin" ? vendedores ?? [] : [{ id: p.id, nome: p.nome }],
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
