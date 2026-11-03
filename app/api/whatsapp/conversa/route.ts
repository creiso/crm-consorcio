import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { perfilApi, type Perfil } from "@/lib/auth";
import { marcarLead } from "@/lib/ia";
import { chaveConversa, telefoneWhatsapp, variacoesCelular } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// Conversa de um lead no painel do Kanban: as mesmas regras de quem vê o quê da rota de leads.
async function leadPermitido(p: Perfil, id: string | null) {
  if (!id) return null;
  const { data: lead } = await db().from("leads").select("id, telefone, vendedor_id, equipe_id").eq("id", id).maybeSingle();
  if (!lead) return null;
  if (p.papel === "admin") return lead;
  if (p.papel === "coordenador" && lead.equipe_id && lead.equipe_id === p.equipe_id) return lead;
  if (p.papel === "vendedor" && lead.vendedor_id === p.id) return lead;
  return null;
}

export async function GET(req: Request) {
  const p = await perfilApi();
  if (p instanceof NextResponse) return p;
  const lead = await leadPermitido(p, new URL(req.url).searchParams.get("lead"));
  if (!lead) return NextResponse.json({ error: "lead não encontrado" }, { status: 404 });
  const tel = telefoneWhatsapp(lead.telefone);
  if (!tel) return NextResponse.json({ semTelefone: true });
  const supa = db();
  const [conversa, mensagens] = await Promise.all([
    supa.from("whatsapp_conversas").select("ia_pausada, motivo, aguardando_ia").eq("chave", chaveConversa(tel)).maybeSingle(),
    supa.from("whatsapp_mensagens").select("id, direcao, origem, texto, status, erro, criada_em")
      .in("telefone", variacoesCelular(tel)).order("criada_em", { ascending: false }).limit(50),
  ]);
  if (conversa.error) return NextResponse.json({ sqlFaltando: true });
  return NextResponse.json({ conversa: conversa.data, mensagens: (mensagens.data ?? []).reverse() });
}

// O consultor responde pelo CRM: a mensagem sai pelo chip e a IA para nessa conversa.
export async function POST(req: Request) {
  const p = await perfilApi();
  if (p instanceof NextResponse) return p;
  const { lead: leadId, texto } = await req.json().catch(() => ({}));
  const lead = await leadPermitido(p, leadId);
  if (!lead) return NextResponse.json({ error: "lead não encontrado" }, { status: 404 });
  const tel = telefoneWhatsapp(lead.telefone);
  const msg = String(texto ?? "").trim();
  if (!tel) return NextResponse.json({ error: "Este lead não tem telefone válido." }, { status: 400 });
  if (!msg) return NextResponse.json({ error: "Escreva a mensagem." }, { status: 400 });
  if (msg.length > 4000) return NextResponse.json({ error: "Mensagem longa demais (máx. 4000 caracteres)." }, { status: 400 });

  const supa = db();
  const chave = chaveConversa(tel);
  const { data: atual } = await supa.from("whatsapp_conversas").select("telefone").eq("chave", chave).maybeSingle();
  const telefone = atual?.telefone ?? tel; // o número como o WhatsApp conhece, se já houve conversa
  const { error } = await supa.from("whatsapp_mensagens").insert({
    telefone, texto: msg, lead_id: lead.id, direcao: "enviada", origem: "crm", status: "pendente", criada_por: p.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supa.from("whatsapp_conversas").upsert({
    chave, telefone, lead_id: lead.id, aguardando_ia: false, tentativas_ia: 0,
    ia_pausada: true, motivo: `${p.nome} assumiu a conversa`, pausada_em: new Date().toISOString(),
  }, { onConflict: "chave" });
  await marcarLead(lead.id, "consultor");
  return NextResponse.json({ ok: true });
}

// Pausar a IA, devolver a conversa para ela ou tirar o aviso do card (o consultor já atendeu por fora).
// Pelo lead (Kanban) ou pela chave da conversa (tela WhatsApp, só admin: pode não haver lead).
export async function PATCH(req: Request) {
  const p = await perfilApi();
  if (p instanceof NextResponse) return p;
  const { lead: leadId, chave: chaveAdmin, acao } = await req.json().catch(() => ({}));
  const supa = db();
  let chave: string;
  let telefone: string;
  let lead: string | null;
  if (leadId) {
    const l = await leadPermitido(p, leadId);
    const tel = telefoneWhatsapp(l?.telefone);
    if (!l || !tel) return NextResponse.json({ error: "lead não encontrado" }, { status: 404 });
    chave = chaveConversa(tel);
    telefone = tel;
    lead = l.id;
  } else {
    if (p.papel !== "admin") return NextResponse.json({ error: "apenas administradores" }, { status: 403 });
    const { data: c } = await supa.from("whatsapp_conversas").select("telefone, lead_id").eq("chave", String(chaveAdmin ?? "")).maybeSingle();
    if (!c) return NextResponse.json({ error: "conversa não encontrada" }, { status: 404 });
    chave = String(chaveAdmin);
    telefone = c.telefone;
    lead = c.lead_id;
  }
  if (acao !== "pausar" && acao !== "devolver" && acao !== "visto") return NextResponse.json({ error: "ação desconhecida" }, { status: 400 });

  if (acao === "visto") {
    await marcarLead(lead, "consultor");
    return NextResponse.json({ ok: true });
  }
  const { data: atual } = await supa.from("whatsapp_conversas").select("telefone").eq("chave", chave).maybeSingle();
  if (acao === "pausar") {
    const { error } = await supa.from("whatsapp_conversas").upsert({
      chave, telefone: atual?.telefone ?? telefone, lead_id: lead, aguardando_ia: false, tentativas_ia: 0,
      ia_pausada: true, motivo: `Pausada por ${p.nome}`, pausada_em: new Date().toISOString(),
    }, { onConflict: "chave" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await marcarLead(lead, "consultor");
    return NextResponse.json({ ok: true });
  }

  // devolver: se a última mensagem é do cliente, a IA responde em seguida
  const { data: ultima } = await supa.from("whatsapp_mensagens").select("direcao, criada_em")
    .in("telefone", variacoesCelular(atual?.telefone ?? telefone)).not("status", "in", "(falhou,expirada)")
    .order("registrada_em", { ascending: false }).order("criada_em", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supa.from("whatsapp_conversas").upsert({
    chave, telefone: atual?.telefone ?? telefone, lead_id: lead, ia_pausada: false, motivo: null, pausada_em: null, tentativas_ia: 0,
    aguardando_ia: ultima?.direcao === "recebida",
    ...(ultima?.direcao === "recebida" ? { ultima_recebida_em: ultima.criada_em } : {}),
  }, { onConflict: "chave" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await marcarLead(lead, null);
  return NextResponse.json({ ok: true });
}
