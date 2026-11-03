import { appendFileSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DisconnectReason, fetchLatestBaileysVersion, jidDecode, makeCacheableSignalKeyStore, makeWASocket, useMultiFileAuthState } from "baileys";
import pino from "pino";
import { esperaAteProximaChamada, paraCrm } from "./mensagens.mjs";

// API própria do WhatsApp: fica ligada neste PC, mantém a conexão com o WhatsApp e fala com o CRM
// só por chamadas de saída. Conta o que chegou e, na resposta, recebe o que precisa enviar.

process.chdir(dirname(fileURLToPath(import.meta.url)));
process.loadEnvFile(".env");
const { CRM_URL, WHATSAPP_CONECTOR_SECRET } = process.env;

const PASTA_SESSAO = "sessao";    // quem tiver esta pasta controla o número
const ARQUIVO_FILA = "fila.json";
const LOTE = 50;                  // itens por chamada ao CRM
const LOGO_MS = 300;
const PAUSA_ENVIO_MS = 1500;      // entre uma mensagem enviada e outra
const PRAZO_WHATSAPP_MS = 30_000;
const PRAZO_CRM_MS = 70_000;       // a resposta da IA é gerada dentro da chamada ao CRM
const RECONEXAO_MAX_MS = 60_000;
const ESPERA_RECUSADO_MS = 5 * 60_000;

const logger = pino({ level: process.env.LOG_NIVEL ?? "silent" });
// A biblioteca de criptografia escreve chaves de sessão no console, então nada mais sai por ali.
// O registro só tem estas linhas: nunca texto de mensagem, telefone, QR code nem segredo.
for (const nivel of ["log", "info", "warn", "error", "debug", "trace"]) console[nivel] = () => {};
function log(...a) {
  try {
    appendFileSync("conector.log", [new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), ...a].join(" ") + "\n");
  } catch {
    // sem registro o conector continua funcionando
  }
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function comPrazo(promessa, ms = PRAZO_WHATSAPP_MS) {
  let t;
  const prazo = new Promise((_, rejeita) => {
    t = setTimeout(() => rejeita(new Error("o WhatsApp não respondeu a tempo (confira no celular)")), ms);
  });
  return Promise.race([promessa, prazo]).finally(() => clearTimeout(t));
}

let sock = null;
let estado = "desconectado";
let qr = null;
let numero = null;
let aviso = null;
let tentativas = 0;

// O que ainda não foi confirmado pelo CRM fica em arquivo: sobrevive se o conector ou o PC reiniciar.
let fila = { recebidas: [], resultados: [] };
try {
  fila = JSON.parse(readFileSync(ARQUIVO_FILA, "utf8"));
} catch {
  // primeira vez: fila vazia
}

function salvarFila() {
  try {
    writeFileSync(`${ARQUIVO_FILA}.tmp`, JSON.stringify(fila));
    renameSync(`${ARQUIVO_FILA}.tmp`, ARQUIVO_FILA);
  } catch (e) {
    log("Não consegui salvar a fila:", e.message);
  }
}

let relogio = null;
let chamando = false;
let chamarDeNovo = false;
let falhasCrm = 0;
let ultimaAtividade = 0;

function agendar(ms) {
  clearTimeout(relogio);
  relogio = setTimeout(chamarCrm, ms);
}

// Algo mudou: não espera a próxima chamada.
function avisarCrm() {
  ultimaAtividade = Date.now();
  if (chamando) chamarDeNovo = true;
  else agendar(LOGO_MS);
}

async function chamarCrm() {
  chamando = true;
  chamarDeNovo = false;
  try {
    const recebidas = fila.recebidas.slice(0, LOTE);
    const resultados = fila.resultados.slice(0, LOTE);
    let enviar = [];
    try {
      const r = await fetch(`${CRM_URL}/api/whatsapp/conector`, {
        method: "POST",
        headers: { authorization: `Bearer ${WHATSAPP_CONECTOR_SECRET}`, "content-type": "application/json" },
        body: JSON.stringify({ estado, qr, numero, aviso, recebidas, resultados }),
        signal: AbortSignal.timeout(PRAZO_CRM_MS),
      });
      if (!r.ok) throw new Error(`o CRM respondeu ${r.status}`);
      ({ enviar = [] } = await r.json());
      // só sai da fila depois da confirmação
      fila.recebidas.splice(0, recebidas.length);
      fila.resultados.splice(0, resultados.length);
      if (recebidas.length || resultados.length) salvarFila();
      if (falhasCrm) log("CRM respondendo de novo.");
      falhasCrm = 0;
    } catch (e) {
      if (!falhasCrm) log("Sem falar com o CRM:", e.message);
      falhasCrm++;
    }
    for (const m of enviar) await enviarUma(m);
  } finally {
    chamando = false;
    const pendencias = chamarDeNovo || fila.recebidas.length > 0 || fila.resultados.length > 0;
    agendar(esperaAteProximaChamada({ falhas: falhasCrm, pendencias, estado, ultimaAtividade }));
  }
}

const jids = new Map(); // telefone → como o WhatsApp conhece (resolve o 9º dígito uma vez só)

async function enviarUma({ id, telefone, texto }) {
  const s = sock;
  try {
    if (estado !== "conectado" || !s) throw new Error("o WhatsApp desconectou antes do envio");
    let jid = jids.get(telefone);
    if (!jid) {
      const achados = await comPrazo(s.onWhatsApp(telefone));
      if (!achados?.[0]?.exists) throw new Error("este número não tem WhatsApp");
      jid = achados[0].jid;
      jids.set(telefone, jid);
    }
    const enviada = await comPrazo(s.sendMessage(jid, { text: texto }));
    fila.resultados.push({ id, ok: true, wa_id: enviada?.key?.id });
  } catch (e) {
    fila.resultados.push({ id, ok: false, erro: e.message });
  }
  salvarFila();
  ultimaAtividade = Date.now();
  await espera(PAUSA_ENVIO_MS);
}

async function aoReceber(s, messages) {
  const pnDoLid = (lid) => s.signalRepository.lidMapping.getPNForLID(lid);
  const meuNumero = jidDecode(s.user?.id)?.user;
  let novas = 0;
  for (const m of messages) {
    try {
      const item = await paraCrm(m, pnDoLid, meuNumero);
      if (item) {
        fila.recebidas.push(item);
        novas++;
      }
    } catch (e) {
      log("Mensagem ignorada por erro:", e.message);
    }
  }
  if (novas) {
    salvarFila();
    avisarCrm();
  }
}

function aoMudarConexao(s, { connection, lastDisconnect, qr: novoQr }) {
  if (s !== sock) return;
  if (novoQr) {
    if (estado !== "qr") log("Aguardando a leitura do QR code.");
    estado = "qr";
    qr = novoQr;
    aviso = null;
    tentativas = 0;
    avisarCrm();
  }
  if (connection === "open") {
    estado = "conectado";
    qr = null;
    aviso = null;
    numero = jidDecode(s.user?.id)?.user ?? null;
    tentativas = 0;
    log("Conectado ao WhatsApp.");
    avisarCrm();
  }
  if (connection === "close") {
    estado = "desconectado";
    qr = null;
    const codigo = lastDisconnect?.error?.output?.statusCode;
    if (codigo === DisconnectReason.loggedOut) {
      log("Aparelho desconectado pelo celular: gerando um QR code novo.");
      sock = null;
      numero = null;
      jids.clear();
      rmSync(PASTA_SESSAO, { recursive: true, force: true });
      setTimeout(conectar, 1000);
    } else if (codigo === DisconnectReason.forbidden) {
      aviso = "O WhatsApp recusou este número (pode ser bloqueio). Abra o WhatsApp no celular do chip e confira.";
      log("O WhatsApp recusou este número (código 403).");
      setTimeout(conectar, ESPERA_RECUSADO_MS);
    } else {
      const ms = codigo === DisconnectReason.restartRequired ? 1000 : Math.min(2000 * 2 ** tentativas++, RECONEXAO_MAX_MS);
      log(`Conexão caiu (código ${codigo ?? "?"}). Tentando de novo em ${Math.round(ms / 1000)} s.`);
      setTimeout(conectar, ms);
    }
    avisarCrm();
  }
}

async function conectar() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(PASTA_SESSAO);
    const { version } = await comPrazo(fetchLatestBaileysVersion(), 15_000).catch(() => ({}));
    const s = makeWASocket({
      ...(version ? { version } : {}),
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      logger,
      browser: ["CRM Consorcio", "Chrome", "1.0"], // nome em "Dispositivos conectados" no celular
      markOnlineOnConnect: false,                  // senão o celular do chip para de receber notificação
      syncFullHistory: false,
      emitOwnEvents: false,                        // o que o conector envia não volta como mensagem nova
    });
    sock = s;
    s.ev.on("creds.update", () => (s === sock ? saveCreds() : undefined));
    s.ev.on("connection.update", (u) => aoMudarConexao(s, u));
    s.ev.on("messages.upsert", ({ messages }) => aoReceber(s, messages));
  } catch (e) {
    log("Falha ao abrir a conexão:", e.message);
    setTimeout(conectar, RECONEXAO_MAX_MS);
  }
}

process.on("unhandledRejection", (e) => log("Erro não tratado:", e?.message ?? e));
process.on("uncaughtException", (e) => {
  log("Erro fatal:", e?.stack ?? e);
  process.exit(1);
});

// Um conector só por vez: dois com a mesma sessão derrubariam um ao outro sem parar.
const trava = net.createServer((c) => c.destroy());
trava.once("error", () => {
  log("Já existe um conector ligado neste PC.");
  process.exit(3);
});
trava.listen("\\\\.\\pipe\\crm-whatsapp-conector", () => {
  log("Conector ligado.");
  conectar();
  chamarCrm();
});
