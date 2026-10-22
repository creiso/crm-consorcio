import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { perfilApi } from "@/lib/auth";

// Registra a venda e move o lead para a coluna "Venda".
// Vendedor: só em nome próprio. Coordenador: leads e vendedores da equipe dele. Admin: qualquer um.
// A venda guarda a equipe do vendedor no momento da venda (é o que conta no placar das equipes).
export async function POST(req: Request) {
  const p = await perfilApi();
  if (p instanceof NextResponse) return p;
  const body = await req.json();
  const { lead_id, valor, tipo, grupo, cota } = body;
  const vendedor_id = p.papel === "vendedor" ? p.id : body.vendedor_id;
  if (!lead_id || !vendedor_id || !(Number(valor) > 0))
    return NextResponse.json({ error: "lead, consultor e valor são obrigatórios" }, { status: 400 });

  const supa = db();
  const [{ data: lead }, { data: vendedor }] = await Promise.all([
    supa.from("leads").select("id, vendedor_id, equipe_id").eq("id", lead_id).maybeSingle(),
    supa.from("vendedores").select("id, equipe_id").eq("id", vendedor_id).eq("ativo", true).maybeSingle(),
  ]);
  if (!lead || !vendedor) return NextResponse.json({ error: "lead ou consultor não encontrado" }, { status: 404 });
  if (p.papel === "vendedor" && lead.vendedor_id !== p.id)
    return NextResponse.json({ error: "lead não é seu" }, { status: 403 });
  if (p.papel === "coordenador" && (lead.equipe_id !== p.equipe_id || vendedor.equipe_id !== p.equipe_id))
    return NextResponse.json({ error: "lead ou consultor fora da sua equipe" }, { status: 403 });

  const venda = await supa
    .from("vendas")
    .insert({ lead_id, vendedor_id, equipe_id: vendedor.equipe_id, valor: Number(valor), tipo: tipo || "imovel", grupo, cota })
    .select()
    .single();
  if (venda.error) return NextResponse.json({ error: venda.error.message }, { status: 500 });

  await supa.from("leads").update({ status: "venda", vendedor_id, equipe_id: vendedor.equipe_id }).eq("id", lead_id);
  return NextResponse.json(venda.data);
}

// Atualiza status do pagamento (aguardando / concluido / cancelado). Só admin.
export async function PATCH(req: Request) {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const { id, pagamento } = await req.json();
  if (!["aguardando", "concluido", "cancelado"].includes(pagamento))
    return NextResponse.json({ error: "pagamento inválido" }, { status: 400 });
  const { error } = await db().from("vendas").update({ pagamento }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
