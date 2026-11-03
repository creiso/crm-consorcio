import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { LIMITE_ENVIANDO_MIN, LIMITE_PENDENTE_MIN, leadsDosTelefones } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

type Recebida = { wa_id: string; telefone: string; texto: string; em: string; de_mim?: boolean };
type Resultado = { id: string; ok: boolean; wa_id?: string; erro?: string };
type Corpo = { estado?: string; qr?: string | null; numero?: string | null; aviso?: string | null; recebidas?: Recebida[]; resultados?: Resultado[] };

function autorizado(req: Request) {
  const segredo = process.env.WHATSAPP_CONECTOR_SECRET;
  if (!segredo) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${segredo}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Única rota do conector (autenticada pelo segredo dele, não por login).
// Ele conta como está e o que chegou; a resposta traz o que ele precisa enviar.
export async function POST(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  const c = (await req.json().catch(() => ({}))) as Corpo;
  const supa = db();
  const agora = new Date();

  const conexao = await supa.from("whatsapp_conexao").update({
    estado: ["conectado", "qr", "desconectado"].includes(c.estado ?? "") ? c.estado : "desconectado",
    qr: c.estado === "qr" ? c.qr ?? null : null,
    numero: c.numero ?? null,
    aviso: c.aviso ?? null,
    visto_em: agora.toISOString(),
  }).eq("id", 1);
  if (conexao.error) return NextResponse.json({ error: "rode o SQL 016_whatsapp.sql no Supabase" }, { status: 503 });

  // o que chegou (mensagem de cliente ou digitada no celular do chip); wa_id repetido é ignorado
  const recebidas = (c.recebidas ?? []).filter((m) => m.wa_id && m.telefone && m.texto);
  if (recebidas.length) {
    const leads = await leadsDosTelefones(recebidas.map((m) => m.telefone));
    const { error } = await supa.from("whatsapp_mensagens").upsert(recebidas.map((m) => ({
      wa_id: m.wa_id,
      telefone: m.telefone,
      lead_id: leads.get(m.telefone) ?? null,
      texto: m.texto,
      direcao: m.de_mim ? "enviada" : "recebida",
      origem: m.de_mim ? "celular" : "cliente",
      status: m.de_mim ? "enviada" : "recebida",
      criada_em: m.em,
      enviada_em: m.de_mim ? m.em : null,
    })), { onConflict: "wa_id", ignoreDuplicates: true });
    // sem confirmar, o conector tenta de novo na próxima chamada
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  for (const r of c.resultados ?? []) {
    await supa.from("whatsapp_mensagens").update(r.ok
      ? { status: "enviada", wa_id: r.wa_id ?? null, enviada_em: agora.toISOString(), erro: null }
      : { status: "falhou", erro: r.erro ?? "falha no envio" }).eq("id", r.id).eq("status", "enviando");
  }

  const minutosAtras = (m: number) => new Date(agora.getTime() - m * 60000).toISOString();
  await supa.from("whatsapp_mensagens").update({ status: "falhou", erro: "o conector não confirmou o envio (confira no celular)" })
    .eq("status", "enviando").lt("enviando_em", minutosAtras(LIMITE_ENVIANDO_MIN));
  await supa.from("whatsapp_mensagens").update({ status: "expirada", erro: `ficou mais de ${LIMITE_PENDENTE_MIN} min na fila com o conector fora do ar` })
    .eq("status", "pendente").lt("criada_em", minutosAtras(LIMITE_PENDENTE_MIN));

  // entrega a fila só com o WhatsApp conectado; "enviando" impede de sair duas vezes
  if (c.estado !== "conectado") return NextResponse.json({ enviar: [] });
  const { data: fila } = await supa.from("whatsapp_mensagens").select("id")
    .eq("status", "pendente").order("criada_em").limit(5);
  const ids = (fila ?? []).map((m) => m.id);
  const { data: enviar } = ids.length
    ? await supa.from("whatsapp_mensagens").update({ status: "enviando", enviando_em: agora.toISOString() })
      .in("id", ids).eq("status", "pendente").select("id, telefone, texto")
    : { data: [] };
  return NextResponse.json({ enviar: enviar ?? [] });
}
