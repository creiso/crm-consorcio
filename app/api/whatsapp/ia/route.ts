import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { perfilApi } from "@/lib/auth";
import { MAX_EXEMPLOS, MAX_INSTRUCOES } from "@/lib/exportWhatsapp";
import { MODELO, erroDaPrimeiraMensagem } from "@/lib/ia";
import { telefoneWhatsapp } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// Configuração da IA e situação das conversas (tela WhatsApp, só admin).
export async function GET() {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const supa = db();
  const umDiaAtras = new Date(Date.now() - 86_400_000).toISOString();
  const [config, conversas, respostas, primeiras] = await Promise.all([
    supa.from("whatsapp_ia").select("*").eq("id", 1).maybeSingle(),
    supa.from("whatsapp_conversas").select("chave, telefone, ia_pausada, motivo, aguardando_ia, ultima_recebida_em, leads(nome)")
      .order("ultima_recebida_em", { ascending: false, nullsFirst: false }).limit(30),
    supa.from("whatsapp_mensagens").select("id", { count: "exact", head: true }).eq("origem", "ia").gt("criada_em", umDiaAtras),
    supa.from("leads").select("id", { count: "exact", head: true }).eq("whatsapp_contato", "enviado").gt("whatsapp_contato_em", umDiaAtras),
  ]);
  if (config.error || !config.data) return NextResponse.json({ sqlFaltando: true });
  return NextResponse.json({
    ...config.data,
    modelo: MODELO,
    chaveConfigurada: !!process.env.GEMINI_API_KEY,
    respostasHoje: respostas.count ?? 0,
    primeirasHoje: primeiras.count ?? 0,
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

  const supa = db();
  const { data: atual } = await supa.from("whatsapp_ia").select("*").eq("id", 1).maybeSingle();
  const temPrimeira = !!atual && "primeira_mensagem" in atual; // depois do SQL 018
  // aba aberta antes da atualização não manda estes campos: ficam como estão, em vez de serem apagados
  const veioPrimeira = "primeira_mensagem" in b;
  const ligar = veioPrimeira ? b.primeiro_contato === true : !!atual?.primeiro_contato;
  if (ligar && !temPrimeira) return NextResponse.json({ error: "Rode o SQL 018_primeira_mensagem.sql no Supabase." }, { status: 400 });
  const primeira = String(b.primeira_mensagem ?? "");
  const erroPrimeira = ligar && veioPrimeira ? erroDaPrimeiraMensagem(primeira) : null;
  if (erroPrimeira) return NextResponse.json({ error: erroPrimeira }, { status: 400 });
  const limite = Number(b.primeiro_contato_limite ?? 30);
  if (!Number.isInteger(limite) || limite < 1 || limite > 200) return NextResponse.json({ error: "O máximo por dia precisa ser de 1 a 200." }, { status: 400 });
  // ligar, ou passar de teste para todos os leads, nunca dispara para quem já estava no CRM
  const comecaAgora = ligar && (!atual?.primeiro_contato || atual?.modo !== b.modo);

  const { error } = await supa.from("whatsapp_ia").update({
    modo: b.modo, numeros_teste: numeros, instrucoes, exemplos,
    ...(temPrimeira && veioPrimeira ? { primeiro_contato: ligar, primeira_mensagem: primeira, primeiro_contato_limite: limite } : {}),
    ...(comecaAgora ? { primeiro_contato_desde: new Date().toISOString() } : {}),
  }).eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, numeros_teste: numeros });
}
