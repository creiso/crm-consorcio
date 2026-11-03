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
  const desde = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const [mensagens, config, novos, contatos, testes] = await Promise.all([
    supa.from("whatsapp_mensagens").select("telefone, direcao, origem, criada_em, registrada_em, enviando_em, enviada_em")
      .order("registrada_em", { ascending: false }).order("criada_em", { ascending: false }).limit(100),
    supa.from("whatsapp_ia").select("*").eq("id", 1).maybeSingle(),
    supa.from("leads").select("created_at, origem").gte("created_at", desde).limit(10000),
    supa.from("leads").select("created_at, whatsapp_contato, whatsapp_contato_em").not("whatsapp_contato", "is", null).order("whatsapp_contato_em", { ascending: false }).limit(20),
    // só o botão de teste da primeira mensagem grava quem mandou numa mensagem da IA
    supa.from("whatsapp_mensagens").select("criada_em, status").eq("origem", "ia").not("criada_por", "is", null).order("criada_em", { ascending: false }).limit(5),
  ]);
  // quantos leads novos chegam por dia e por hora (Brasília), para calibrar a primeira mensagem
  const porDia: Record<string, number> = {};
  const porHora: Record<string, number> = {};
  const porOrigem: Record<string, number> = {};
  for (const l of novos.data ?? []) {
    const d = new Date(l.created_at);
    const dia = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const h = d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" });
    porDia[dia] = (porDia[dia] ?? 0) + 1;
    porHora[h] = (porHora[h] ?? 0) + 1;
    porOrigem[l.origem ?? "?"] = (porOrigem[l.origem ?? "?"] ?? 0) + 1;
  }
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
  const c = config.data;
  return NextResponse.json({
    modo: c?.modo, erro: c?.erro, erro_em: c?.erro_em, parada_ate: c?.parada_ate,
    primeiroContato: c && {
      ligado: c.primeiro_contato, desde: c.primeiro_contato_desde, limite: c.primeiro_contato_limite, temTexto: !!c.primeira_mensagem,
      sqlRodado: "primeira_mensagem" in c,
      testesDoBotao: testes.data ?? [],
      ultimos: (contatos.data ?? []).map((l) => ({ situacao: l.whatsapp_contato, lead_ate_mensagem_s: segundos(l.created_at, l.whatsapp_contato_em) })),
    },
    respostas: respostas.slice(-10),
    leads: { porDia, porHora, porOrigem },
  });
}
