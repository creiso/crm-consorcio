import { createHash } from "crypto";
import { db } from "./supabase";

// API de Conversões da Meta, integração de CRM: cada mudança de etapa do lead vira um evento.
// O gatilho do banco (SQL 010) põe os eventos na fila eventos_meta; aqui a fila é enviada.
// Configuração na Vercel: META_CAPI_TOKEN (obrigatório), META_DATASET_ID e META_TEST_EVENT_CODE (opcionais).

const VERSAO_API = "v26.0";
const DATASET_PADRAO = "1818084516284638";
const MAX_TENTATIVAS = 5;
const SETE_DIAS_MS = 7 * 24 * 3600000; // a Meta recusa eventos com mais de 7 dias

// Nomes das etapas como aparecem no Gerenciador de Eventos (sem acento, para evitar problema de codificação)
export const NOME_EVENTO: Record<string, string> = {
  lead: "Lead",
  atendimento: "Em atendimento",
  quente: "Quente",
  frio: "Frio",
  reuniao: "Reuniao agendada",
  reuniao_feita: "Reuniao realizada",
  venda: "Venda",
  descarte: "Descarte",
};

export type LeadMeta = {
  id: string; external_key: string; nome: string; email: string | null; telefone: string | null;
  cidade: string | null; plataforma: string | null;
};

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const semAcento = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "");

// "l:1325547393047001" no fim da chave = identificação do lead gerada pela Meta (15 a 17 dígitos)
export const leadIdMeta = (externalKey: string) => externalKey.match(/(?:^|:)l:(\d{15,17})$/)?.[1] ?? null;

// Telefone no padrão da Meta: só dígitos, com DDI (Brasil = 55)
function telefoneMeta(tel: string | null) {
  const d = (tel ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length < 10) return null;
  return d.length <= 11 ? "55" + d : d;
}

// Dados de contato normalizados como a Meta pede e convertidos em hash SHA-256.
export function dadosCliente(l: LeadMeta) {
  const partes = semAcento(l.nome).toLowerCase().replace(/[^a-z\s]/g, "").trim().split(/\s+/).filter(Boolean);
  const tel = telefoneMeta(l.telefone);
  const cidade = l.cidade ? semAcento(l.cidade).toLowerCase().replace(/[^a-z]/g, "") : "";
  return {
    ...(l.email ? { em: [sha256(l.email.trim().toLowerCase())] } : {}),
    ...(tel ? { ph: [sha256(tel)] } : {}),
    ...(partes[0] ? { fn: [sha256(partes[0])] } : {}),
    ...(partes.length > 1 ? { ln: [sha256(partes[partes.length - 1])] } : {}),
    ...(cidade ? { ct: [sha256(cidade)] } : {}),
    country: [sha256("br")],
    external_id: [sha256(l.id)],
  };
}

// Um evento no formato do guia da Meta (action_source system_generated, event_source crm).
export function montarEvento(l: LeadMeta, evento: string, ocorridoEm: Date) {
  const leadId = leadIdMeta(l.external_key);
  return {
    event_name: NOME_EVENTO[evento] ?? evento,
    event_time: Math.floor(ocorridoEm.getTime() / 1000),
    action_source: "system_generated",
    event_id: `${l.id}:${evento}`, // a mesma etapa repetida em 48 h não conta duas vezes
    custom_data: { event_source: "crm", lead_event_source: "CRM Consorcio" },
    user_data: { ...(leadId ? { lead_id: leadId } : {}), ...dadosCliente(l) },
  };
}

// lead_id vai como número (como no exemplo da Meta) sem perder dígitos no JSON
export const corpoJson = (eventos: object[], teste: string | undefined) =>
  JSON.stringify({ data: eventos, ...(teste ? { test_event_code: teste } : {}) })
    .replace(/"lead_id":"(\d{15,17})"/g, '"lead_id":$1');

async function postar(eventos: object[]) {
  const url = `https://graph.facebook.com/${VERSAO_API}/${process.env.META_DATASET_ID || DATASET_PADRAO}/events`
    + `?access_token=${encodeURIComponent(process.env.META_CAPI_TOKEN!)}`;
  const r = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: corpoJson(eventos, process.env.META_TEST_EVENT_CODE || undefined),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.error_user_msg || j?.error?.message || `Meta respondeu ${r.status}`);
  return j as { events_received?: number };
}

type Fila = { id: number; evento: string; ocorrido_em: string; tentativas: number; leads: LeadMeta | null };

// Envia a fila (chamado a cada minuto pela sincronização). Só vão leads que vieram da Meta:
// com identificação do lead "l:..." ou plataforma Facebook/Instagram.
export async function enviarEventosMeta() {
  if (!process.env.META_CAPI_TOKEN) return { ativo: false as const };
  const supa = db();
  const { data, error } = await supa.from("eventos_meta")
    .select("id, evento, ocorrido_em, tentativas, leads(id, external_key, nome, email, telefone, cidade, plataforma)")
    .is("enviado_em", null).lt("tentativas", MAX_TENTATIVAS).order("ocorrido_em").limit(500);
  if (error) return { ativo: true as const, erro: "rode o SQL 010_meta_conversoes.sql no Supabase" };

  const fila = (data ?? []) as unknown as Fila[];
  const agora = Date.now();
  const marcar = (ids: number[], campos: Record<string, unknown>) =>
    ids.length ? supa.from("eventos_meta").update(campos).in("id", ids) : Promise.resolve();

  const ignorar: number[] = [], antigos: number[] = [], prontos: { id: number; tentativas: number; evento: object }[] = [];
  for (const f of fila) {
    const l = f.leads;
    const daMeta = !!l && (!!leadIdMeta(l.external_key) || ["fb", "ig"].includes(l.plataforma ?? ""));
    if (!l || !daMeta) ignorar.push(f.id);
    else if (agora - new Date(f.ocorrido_em).getTime() > SETE_DIAS_MS) antigos.push(f.id);
    else prontos.push({ id: f.id, tentativas: f.tentativas, evento: montarEvento(l, f.evento, new Date(f.ocorrido_em)) });
  }
  const agoraIso = new Date().toISOString();
  await marcar(ignorar, { enviado_em: agoraIso, erro: "não veio da Meta (não enviado)" });
  await marcar(antigos, { enviado_em: agoraIso, erro: "mais de 7 dias (a Meta não aceita)" });

  let enviados = 0, falhas = 0, ultimoErro: string | null = null;
  // lotes de 100; se a Meta recusar o lote, tenta um por um para achar o evento com problema
  for (let i = 0; i < prontos.length; i += 100) {
    const lote = prontos.slice(i, i + 100);
    try {
      await postar(lote.map((p) => p.evento));
      await marcar(lote.map((p) => p.id), { enviado_em: new Date().toISOString(), erro: null });
      enviados += lote.length;
    } catch {
      for (const p of lote) {
        try {
          await postar([p.evento]);
          await marcar([p.id], { enviado_em: new Date().toISOString(), erro: null });
          enviados++;
        } catch (e) {
          falhas++;
          ultimoErro = (e as Error).message;
          await marcar([p.id], { tentativas: p.tentativas + 1, erro: ultimoErro });
        }
      }
    }
  }
  return { ativo: true as const, teste: !!process.env.META_TEST_EVENT_CODE, enviados, falhas, ultimoErro, ignorados: ignorar.length + antigos.length };
}
