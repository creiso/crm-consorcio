import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

// Registra a venda e move o lead para a coluna "Venda".
export async function POST(req: Request) {
  const { lead_id, vendedor_id, valor, tipo, grupo, cota } = await req.json();
  if (!lead_id || !vendedor_id || !(Number(valor) > 0))
    return NextResponse.json({ error: "lead, vendedor e valor são obrigatórios" }, { status: 400 });

  const supa = db();
  const venda = await supa
    .from("vendas")
    .insert({ lead_id, vendedor_id, valor: Number(valor), tipo: tipo || "imovel", grupo, cota })
    .select()
    .single();
  if (venda.error) return NextResponse.json({ error: venda.error.message }, { status: 500 });

  await supa.from("leads").update({ status: "venda", vendedor_id }).eq("id", lead_id);
  return NextResponse.json(venda.data);
}

// Atualiza status do pagamento (aguardando / concluido / cancelado).
export async function PATCH(req: Request) {
  const { id, pagamento } = await req.json();
  if (!["aguardando", "concluido", "cancelado"].includes(pagamento))
    return NextResponse.json({ error: "pagamento inválido" }, { status: 400 });
  const { error } = await db().from("vendas").update({ pagamento }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
