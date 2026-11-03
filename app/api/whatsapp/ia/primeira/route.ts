import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { perfilApi } from "@/lib/auth";
import { colocarNome } from "@/lib/dadosPessoais";
import { erroDaPrimeiraMensagem } from "@/lib/ia";
import { chaveConversa } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// Manda a primeira mensagem salva para os números de teste, para ver como ela chega e continuar a conversa.
export async function POST() {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const supa = db();
  const { data: config } = await supa.from("whatsapp_ia").select("*").eq("id", 1).maybeSingle();
  if (!config || !("primeira_mensagem" in config)) return NextResponse.json({ error: "Rode o SQL 018_primeira_mensagem.sql no Supabase." }, { status: 400 });
  const erro = erroDaPrimeiraMensagem(config.primeira_mensagem);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  const numeros: string[] = config.numeros_teste ?? [];
  if (!numeros.length) return NextResponse.json({ error: "Cadastre pelo menos um número de teste." }, { status: 400 });

  const texto = colocarNome(config.primeira_mensagem.trim(), p.nome);
  for (const numero of numeros) {
    const chave = chaveConversa(numero);
    const { data: atual } = await supa.from("whatsapp_conversas").select("telefone").eq("chave", chave).maybeSingle();
    const telefone = atual?.telefone ?? numero; // o número como o WhatsApp conhece, se já houve conversa
    const { error } = await supa.from("whatsapp_mensagens").insert({ telefone, texto, direcao: "enviada", origem: "ia", status: "pendente", criada_por: p.id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await supa.from("whatsapp_conversas").upsert({
      chave, telefone, aguardando_ia: false, tentativas_ia: 0, ia_pausada: false, motivo: null, pausada_em: null,
    }, { onConflict: "chave" });
  }
  return NextResponse.json({ ok: true, enviados: numeros.length });
}
