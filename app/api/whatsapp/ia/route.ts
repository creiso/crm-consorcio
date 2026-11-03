import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { perfilApi } from "@/lib/auth";
import { MAX_EXEMPLOS, MAX_INSTRUCOES } from "@/lib/exportWhatsapp";
import { MODELO } from "@/lib/ia";
import { telefoneWhatsapp } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// Configuração da IA e situação das conversas (tela WhatsApp, só admin).
export async function GET() {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const supa = db();
  const umDiaAtras = new Date(Date.now() - 86_400_000).toISOString();
  const [config, conversas, respostas] = await Promise.all([
    supa.from("whatsapp_ia").select("modo, numeros_teste, instrucoes, exemplos, erro, erro_em").eq("id", 1).maybeSingle(),
    supa.from("whatsapp_conversas").select("chave, telefone, ia_pausada, motivo, aguardando_ia, ultima_recebida_em, leads(nome)")
      .order("ultima_recebida_em", { ascending: false, nullsFirst: false }).limit(30),
    supa.from("whatsapp_mensagens").select("id", { count: "exact", head: true }).eq("origem", "ia").gt("criada_em", umDiaAtras),
  ]);
  if (config.error || !config.data) return NextResponse.json({ sqlFaltando: true });
  return NextResponse.json({
    ...config.data,
    modelo: MODELO,
    chaveConfigurada: !!process.env.GEMINI_API_KEY,
    respostasHoje: respostas.count ?? 0,
    conversas: conversas.data ?? [],
  });
}

export async function PUT(req: Request) {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const b = await req.json().catch(() => ({}));
  if (!["desligada", "teste", "ligada"].includes(b.modo)) return NextResponse.json({ error: "Escolha como a IA deve funcionar." }, { status: 400 });
  const instrucoes = String(b.instrucoes ?? "");
  const exemplos = String(b.exemplos ?? "");
  if (instrucoes.length > MAX_INSTRUCOES) return NextResponse.json({ error: `As informações da empresa passam de ${MAX_INSTRUCOES} caracteres.` }, { status: 400 });
  if (exemplos.length > MAX_EXEMPLOS) return NextResponse.json({ error: `Os exemplos passam de ${MAX_EXEMPLOS} caracteres. Deixe só as melhores conversas.` }, { status: 400 });

  const digitados = String(b.numeros_teste ?? "").split(/[,;\n]+/).map((n) => n.trim()).filter(Boolean);
  const numeros = digitados.map(telefoneWhatsapp);
  const invalido = digitados.find((_, i) => !numeros[i]);
  if (invalido) return NextResponse.json({ error: `Número de teste inválido: ${invalido}` }, { status: 400 });

  const { error } = await db().from("whatsapp_ia").update({ modo: b.modo, numeros_teste: numeros, instrucoes, exemplos }).eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, numeros_teste: numeros });
}
