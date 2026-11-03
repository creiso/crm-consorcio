import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { perfilApi } from "@/lib/auth";
import { LIMITE_ONLINE_SEG, leadsDosTelefones, telefoneWhatsapp } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// Situação da conexão e últimas mensagens (tela WhatsApp, só admin nesta etapa).
export async function GET() {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const supa = db();
  const [conexao, mensagens] = await Promise.all([
    supa.from("whatsapp_conexao").select("estado, qr, numero, aviso, visto_em").eq("id", 1).maybeSingle(),
    supa.from("whatsapp_mensagens").select("id, telefone, direcao, origem, texto, status, erro, criada_em, leads(nome)")
      .order("criada_em", { ascending: false }).limit(30),
  ]);
  if (conexao.error) return NextResponse.json({ sqlFaltando: true });
  const visto = conexao.data?.visto_em ? new Date(conexao.data.visto_em).getTime() : 0;
  return NextResponse.json({
    ...conexao.data,
    online: Date.now() - visto < LIMITE_ONLINE_SEG * 1000,
    mensagens: mensagens.data ?? [],
  });
}

// Coloca uma mensagem na fila; o conector envia na próxima chamada.
export async function POST(req: Request) {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const { telefone, texto } = await req.json().catch(() => ({}));
  const tel = telefoneWhatsapp(telefone);
  const msg = String(texto ?? "").trim();
  if (!tel) return NextResponse.json({ error: "Telefone inválido. Use DDD + número." }, { status: 400 });
  if (!msg) return NextResponse.json({ error: "Escreva a mensagem." }, { status: 400 });
  if (msg.length > 4000) return NextResponse.json({ error: "Mensagem longa demais (máx. 4000 caracteres)." }, { status: 400 });

  const leads = await leadsDosTelefones([tel]);
  const { error } = await db().from("whatsapp_mensagens").insert({
    telefone: tel, texto: msg, lead_id: leads.get(tel) ?? null,
    direcao: "enviada", origem: "crm", status: "pendente", criada_por: p.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
