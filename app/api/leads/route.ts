import { NextResponse } from "next/server";
import { db, STATUSES } from "@/lib/supabase";
import { perfilApi } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Quem vê o quê: admin vê todos (e pode filtrar ?equipe=<id> ou ?equipe=sem);
// coordenador vê os leads da equipe dele; vendedor só os leads ligados a ele.
// Cada coluna traz só os N mais recentes (?lead=50&quente=100...) e o total, para o kanban ficar leve.
export async function GET(req: Request) {
  const p = await perfilApi();
  if (p instanceof NextResponse) return p;
  const params = new URL(req.url).searchParams;
  // busca: tira caracteres que quebram o filtro do PostgREST
  const q = (params.get("q") ?? "").replace(/[,()*%]/g, " ").trim();
  const filtroEquipe = p.papel === "admin" ? params.get("equipe") : null;
  const supa = db();

  const colunas = await Promise.all(
    STATUSES.map(async (s) => {
      const limite = Math.min(Math.max(Number(params.get(s.id)) || 50, 1), 1000);
      const query = supa.from("leads").select("*, vendedores(nome, foto_url), equipes(nome)", { count: "exact" })
        .eq("status", s.id).order("criado_em", { ascending: false }).limit(limite);
      if (p.papel === "vendedor") query.eq("vendedor_id", p.id);
      if (p.papel === "coordenador") query.eq("equipe_id", p.equipe_id ?? "00000000-0000-0000-0000-000000000000");
      if (filtroEquipe === "sem") query.is("equipe_id", null);
      else if (filtroEquipe) query.eq("equipe_id", filtroEquipe);
      if (q) query.or(`nome.ilike.*${q}*,telefone.ilike.*${q.replace(/\D/g, "") || q}*,cidade.ilike.*${q}*,email.ilike.*${q}*`);
      const { data, count, error } = await query;
      if (error) throw new Error(error.message);
      return { status: s.id, leads: data ?? [], total: count ?? 0 };
    })
  ).catch((e: Error) => e);
  if (colunas instanceof Error) return NextResponse.json({ error: colunas.message }, { status: 500 });

  // para quem o lead pode ser passado: admin → qualquer um ativo; coordenador → a própria equipe
  let vendedores: { id: string; nome: string; papel: string; equipe_id: string | null }[] = [{ id: p.id, nome: p.nome, papel: p.papel, equipe_id: p.equipe_id }];
  if (p.papel !== "vendedor") {
    const v = supa.from("vendedores").select("id, nome, papel, equipe_id").eq("ativo", true).order("nome");
    if (p.papel === "coordenador") v.eq("equipe_id", p.equipe_id ?? "00000000-0000-0000-0000-000000000000");
    vendedores = (await v).data ?? [];
  }
  const { data: equipes } = p.papel === "vendedor"
    ? { data: [] }
    : await supa.from("equipes").select("id, nome").order("nome");

  return NextResponse.json({
    leads: colunas.flatMap((c) => c.leads),
    totais: Object.fromEntries(colunas.map((c) => [c.status, c.total])),
    vendedores,
    equipes: equipes ?? [],
    perfil: p,
  });
}

// Move o lead de coluna (a etapa "venda" é feita via /api/vendas).
// Admin e coordenador também trocam o vendedor (o coordenador só dentro da equipe dele).
export async function PATCH(req: Request) {
  const p = await perfilApi();
  if (p instanceof NextResponse) return p;
  const { id, status, vendedor_id } = await req.json();
  const supa = db();

  const { data: lead } = await supa.from("leads").select("id, vendedor_id, equipe_id").eq("id", id).maybeSingle();
  const pode = lead && (p.papel === "admin"
    || (p.papel === "coordenador" && !!p.equipe_id && lead.equipe_id === p.equipe_id)
    || (p.papel === "vendedor" && lead.vendedor_id === p.id));
  if (!pode) return NextResponse.json({ error: "lead fora do seu acesso" }, { status: 403 });

  const patch: Record<string, unknown> = {};
  if (status !== undefined) {
    if (!STATUSES.some((s) => s.id === status) || status === "venda")
      return NextResponse.json({ error: "status inválido" }, { status: 400 });
    patch.status = status;
  }
  if (vendedor_id !== undefined) {
    if (p.papel === "vendedor") return NextResponse.json({ error: "apenas admin ou coordenador distribuem leads" }, { status: 403 });
    if (vendedor_id) {
      const { data: alvo } = await supa.from("vendedores").select("id, equipe_id").eq("id", vendedor_id).eq("ativo", true).maybeSingle();
      if (!alvo || (p.papel === "coordenador" && alvo.equipe_id !== p.equipe_id))
        return NextResponse.json({ error: "esse consultor não está na sua equipe" }, { status: 403 });
      patch.vendedor_id = alvo.id;
      patch.equipe_id = alvo.equipe_id; // o lead acompanha a equipe do dono
    } else {
      patch.vendedor_id = null; // volta para a fila da equipe
    }
  }

  const { error } = await supa.from("leads").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
