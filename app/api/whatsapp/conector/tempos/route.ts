import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { conectorAutorizado } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const segundos = (de?: string | null, ate?: string | null) =>
  de && ate ? Math.round((new Date(ate).getTime() - new Date(de).getTime()) / 100) / 10 : null;

// Quanto tempo as últimas respostas da IA levaram. Só números: nada de texto nem telefone.
export async function POST(req: Request) {
  if (!conectorAutorizado(req)) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  const supa = db();
  const [mensagens, config] = await Promise.all([
    supa.from("whatsapp_mensagens").select("telefone, direcao, origem, criada_em, registrada_em, enviando_em, enviada_em")
      .order("registrada_em", { ascending: false }).order("criada_em", { ascending: false }).limit(100),
    supa.from("whatsapp_ia").select("modo, erro, erro_em, parada_ate").eq("id", 1).maybeSingle(),
  ]);
  const linhas = (mensagens.data ?? []).reverse();
  const respostas = linhas.flatMap((m, i) => {
    if (m.origem !== "ia") return [];
    const pergunta = linhas.slice(0, i).reverse().find((x) => x.telefone === m.telefone && x.direcao === "recebida");
    return [{
      quando: m.criada_em,
      chegou_no_crm_s: segundos(pergunta?.criada_em, pergunta?.registrada_em),
      resposta_gerada_s: segundos(pergunta?.criada_em, m.criada_em),
      foi_para_o_conector_s: segundos(m.criada_em, m.enviando_em),
      confirmada_s: segundos(pergunta?.criada_em, m.enviada_em),
    }];
  });
  return NextResponse.json({ ...config.data, respostas: respostas.slice(-10) });
}
