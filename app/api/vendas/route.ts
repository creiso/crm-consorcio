import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { perfilApi } from "@/lib/auth";

// Registra a venda e move o lead para a coluna "Venda".
export async function POST(req: Request) {
  const p = await perfilApi();
  if (p instanceof NextResponse) return p;
  const body = await req.json();
  const { lead_id, valor, tipo, grupo, cota } = body;
  // vendedor só registra venda em nome próprio
  const vendedor_id = p.papel === "admin" ? body.vendedor_id : p.id;
  if (!lead_id || !vendedor_id || !(Number(valor) > 0))
    return NextResponse.json({ error: "lead, vendedor e valor são obrigatórios" }, { status: 400 });

  const supa = db();
  if (p.papel !== "admin") {
    const { data: lead } = await supa.from("leads").select("id").eq("id", lead_id).eq("vendedor_id", p.id).maybeSingle();
    if (!lead) return NextResponse.json({ error: "lead não é seu" }, { status: 403 });
  }

  const venda = await supa
    .from("vendas")
    .insert({ lead_id, vendedor_id, valor: Number(valor), tipo: tipo || "imovel", grupo, cota })
    .select()
    .single();
  if (venda.error) return NextResponse.json({ error: venda.error.message }, { status: 500 });

  await supa.from("leads").update({ status: "venda", vendedor_id }).eq("id", lead_id);
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
