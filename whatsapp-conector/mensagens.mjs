import { isHostedLidUser, isHostedPnUser, isLidUser, isPnUser, jidDecode, normalizeMessageContent, toNumber } from "baileys";

// Regras do conector que não dependem da conexão: o que vai para o CRM e quando chamar o CRM de novo.

const legenda = (rotulo, m) => (m.caption ? `${rotulo} ${m.caption}` : rotulo);

// Texto que aparece no CRM. Mídia vira etiqueta; o que é técnico (reação, apagar, recibo) volta null.
export function textoDaMensagem(message) {
  const c = normalizeMessageContent(message);
  if (!c) return null;
  if (c.conversation) return c.conversation;
  if (c.extendedTextMessage?.text) return c.extendedTextMessage.text;
  if (c.imageMessage) return legenda("[imagem]", c.imageMessage);
  if (c.videoMessage || c.ptvMessage) return legenda("[vídeo]", c.videoMessage ?? c.ptvMessage);
  if (c.documentMessage) {
    const nome = c.documentMessage.fileName;
    return legenda(nome ? `[documento: ${nome}]` : "[documento]", c.documentMessage);
  }
  if (c.audioMessage) return "[áudio]";
  if (c.stickerMessage) return "[figurinha]";
  if (c.contactMessage || c.contactsArrayMessage) return "[contato]";
  if (c.locationMessage || c.liveLocationMessage) return "[localização]";
  return c.buttonsResponseMessage?.selectedDisplayText
    ?? c.listResponseMessage?.title
    ?? c.templateButtonReplyMessage?.selectedDisplayText
    ?? null;
}

const ehLid = (jid) => isLidUser(jid) || isHostedLidUser(jid);
const digitos = (jid) => jidDecode(jid)?.user ?? null;

// Telefone da outra pessoa da conversa; null em grupo, status e canal.
// Contato com número escondido (LID): na mensagem recebida o telefone vem junto. Na enviada pelo celular
// esse campo pode trazer o número do próprio chip, então vale primeiro o que a biblioteca já conhece.
export async function telefoneDoContato(key, pnDoLid, meuNumero) {
  const { remoteJid, remoteJidAlt, fromMe } = key;
  if (!ehLid(remoteJid)) return isPnUser(remoteJid) || isHostedPnUser(remoteJid) ? digitos(remoteJid) : null;
  const alt = remoteJidAlt && !ehLid(remoteJidAlt) ? digitos(remoteJidAlt) : null;
  if (alt && !fromMe) return alt;
  const pn = await pnDoLid(remoteJid).catch(() => null);
  if (pn) return digitos(pn);
  if (alt && alt !== meuNumero) return alt;
  return `lid:${digitos(remoteJid)}`; // sem telefone conhecido: guarda assim para a mensagem não se perder
}

// Mensagem do WhatsApp no formato do CRM; null quando não é para aparecer lá.
export async function paraCrm(msg, pnDoLid, meuNumero) {
  const texto = textoDaMensagem(msg.message);
  if (!texto || !msg.key?.id) return null;
  const telefone = await telefoneDoContato(msg.key, pnDoLid, meuNumero);
  if (!telefone) return null;
  const segundos = toNumber(msg.messageTimestamp);
  return {
    wa_id: msg.key.id,
    telefone,
    texto,
    em: new Date(segundos ? segundos * 1000 : Date.now()).toISOString(),
    de_mim: !!msg.key.fromMe,
  };
}

// O mesmo horário comercial do CRM (lib/painel.ts): seg a sex 08:30–18:30, sáb 08:00–12:00.
const EXPEDIENTE = { Mon: [510, 1110], Tue: [510, 1110], Wed: [510, 1110], Thu: [510, 1110], Fri: [510, 1110], Sat: [480, 720] };
const FORMATO = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" });

export function emExpediente(agora = new Date()) {
  const p = Object.fromEntries(FORMATO.formatToParts(agora).map((x) => [x.type, x.value]));
  const faixa = EXPEDIENTE[p.weekday];
  const minutos = Number(p.hour) * 60 + Number(p.minute);
  return !!faixa && minutos >= faixa[0] && minutos < faixa[1];
}

const LOGO_MS = 300;
const RAPIDO_MS = 5_000;
const LENTO_MS = 30_000;
const ATIVO_POR_MS = 5 * 60_000; // depois de uma mensagem, continua rápido por este tempo
const ERRO_MAX_MS = 60_000;

// Rápido em horário comercial e logo depois de uma mensagem; devagar no resto, para gastar pouco da Vercel.
export function esperaAteProximaChamada({ falhas, pendencias, estado, ultimaAtividade, chamarEm = null }, agora = new Date()) {
  if (falhas) return Math.min(RAPIDO_MS * 2 ** (falhas - 1), ERRO_MAX_MS);
  if (pendencias) return LOGO_MS;
  const normal = estado === "qr" || agora.getTime() - ultimaAtividade < ATIVO_POR_MS || emExpediente(agora) ? RAPIDO_MS : LENTO_MS;
  // o CRM avisa quando a próxima resposta da IA fica pronta: chama na hora certa
  return chamarEm === null ? normal : Math.max(LOGO_MS, Math.min(chamarEm, normal));
}
