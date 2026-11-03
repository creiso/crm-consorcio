import { app, BrowserWindow, clipboard, Menu, net, screen, session, shell } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ENDERECO, acaoDoTeclado, destinoDoLink } from "./regras.mjs";

// App do CRM para Windows: uma janela própria que abre o site publicado.
// O servidor e as chaves continuam na Vercel; nada secreto fica neste programa.

const PASTA = dirname(fileURLToPath(import.meta.url));
const TELA_OFFLINE = join(PASTA, "offline.html");
const ICONE = join(PASTA, "recursos", "icone.png");
const TENTAR_DE_NOVO_MS = 5000;
const ZOOM_MAX = 3;
const PERMISSOES = new Set(["fullscreen", "clipboard-sanitized-write"]); // o placar usa tela cheia

// O nome do programa tem acento e entraria na identificação enviada aos sites:
// com isso o Turnstile não libera o login.
app.userAgentFallback = app.userAgentFallback.replace(/\s\S*[^\x00-\x7f]\S*/g, "");

const arquivoJanela = () => join(app.getPath("userData"), "janela.json");

// Tamanho e posição da última vez. Na primeira vez abre maximizada, porque o Kanban é largo.
function lerJanela() {
  try {
    const j = JSON.parse(readFileSync(arquivoJanela(), "utf8"));
    const area = screen.getDisplayMatching(j).workArea;
    const visivel = j.x < area.x + area.width && j.x + j.width > area.x && j.y < area.y + area.height && j.y + j.height > area.y;
    return visivel ? j : { ...j, x: undefined, y: undefined }; // monitor desconectado: não abre fora da tela
  } catch {
    return { maximizada: true };
  }
}

function guardarJanela(janela) {
  try {
    writeFileSync(arquivoJanela(), JSON.stringify({ ...janela.getNormalBounds(), maximizada: janela.isMaximized() }));
  } catch {
    // sem isso o app só abre no tamanho padrão da próxima vez
  }
}

const ACOES = {
  atualizar: (c) => (c.getURL().startsWith("file:") ? c.loadURL(ENDERECO) : c.reload()),
  telaCheia: (c) => {
    const j = BrowserWindow.fromWebContents(c);
    j?.setFullScreen(!j.isFullScreen());
  },
  zoomMais: (c) => c.setZoomLevel(Math.min(c.getZoomLevel() + 0.5, ZOOM_MAX)),
  zoomMenos: (c) => c.setZoomLevel(Math.max(c.getZoomLevel() - 0.5, -ZOOM_MAX)),
  zoomNormal: (c) => c.setZoomLevel(0),
  voltar: (c) => c.navigationHistory.canGoBack() && c.navigationHistory.goBack(),
  avancar: (c) => c.navigationHistory.canGoForward() && c.navigationHistory.goForward(),
};

// O Electron não traz botão direito: sem isso não dá para copiar e colar com o mouse.
function menuDoBotaoDireito(conteudo, p) {
  const itens = p.dictionarySuggestions.slice(0, 5).map((s) => ({ label: s, click: () => conteudo.replaceMisspelling(s) }));
  if (itens.length) itens.push({ type: "separator" });
  if (p.linkURL && destinoDoLink(p.linkURL) !== "bloquear") itens.push({ label: "Copiar link", click: () => clipboard.writeText(p.linkURL) });
  if (p.isEditable) {
    itens.push(
      { label: "Recortar", role: "cut", enabled: p.editFlags.canCut },
      { label: "Copiar", role: "copy", enabled: p.editFlags.canCopy },
      { label: "Colar", role: "paste", enabled: p.editFlags.canPaste },
      { type: "separator" },
      { label: "Selecionar tudo", role: "selectAll" },
    );
  } else if (p.selectionText.trim()) {
    itens.push({ label: "Copiar", role: "copy" });
  }
  if (itens.length) Menu.buildFromTemplate(itens).popup({ window: BrowserWindow.fromWebContents(conteudo) ?? undefined });
}

// Vale para toda janela: só o CRM abre aqui dentro. O resto (como o link do WhatsApp) abre fora.
app.on("web-contents-created", (_, conteudo) => {
  conteudo.setWindowOpenHandler(({ url }) => {
    const destino = destinoDoLink(url);
    if (destino === "navegador") shell.openExternal(url);
    return { action: destino === "app" ? "allow" : "deny" };
  });
  conteudo.on("will-navigate", (e, url) => {
    const destino = destinoDoLink(url);
    if (destino === "app") return;
    e.preventDefault();
    if (destino === "navegador") shell.openExternal(url);
  });
  conteudo.on("context-menu", (_e, p) => menuDoBotaoDireito(conteudo, p));
  conteudo.on("before-input-event", (e, tecla) => {
    const acao = acaoDoTeclado(tecla);
    if (!acao) return;
    e.preventDefault();
    ACOES[acao](conteudo);
  });
});

let tentativa = null;

// Sem internet: mostra um aviso e volta sozinho quando o site responder.
function mostrarSemInternet(janela, url) {
  janela.loadFile(TELA_OFFLINE);
  clearInterval(tentativa);
  tentativa = setInterval(async () => {
    if (janela.isDestroyed()) return clearInterval(tentativa);
    const r = await net.fetch(`${ENDERECO}/login`, { method: "HEAD" }).catch(() => null);
    if (!r) return;
    clearInterval(tentativa);
    janela.loadURL(destinoDoLink(url) === "app" ? url : ENDERECO);
  }, TENTAR_DE_NOVO_MS);
}

function abrirJanela() {
  const salva = lerJanela();
  const janela = new BrowserWindow({
    width: salva.width ?? 1280, height: salva.height ?? 800, x: salva.x, y: salva.y,
    minWidth: 380, minHeight: 500,
    title: "CRM Consórcio", icon: ICONE, backgroundColor: "#f5f6f8",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  if (salva.maximizada) janela.maximize();
  janela.on("close", () => guardarJanela(janela));
  janela.webContents.on("did-fail-load", (_e, codigo, _texto, url, principal) => {
    if (principal && codigo !== -3 && !url.startsWith("file:")) mostrarSemInternet(janela, url); // -3 = navegação cancelada
  });
  janela.loadURL(ENDERECO);
  return janela;
}

// Um app só por vez: abrir de novo traz para frente a janela que já está aberta.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let principal = null;
  app.setAppUserModelId("br.com.crmconsorcio.app");
  Menu.setApplicationMenu(null);
  app.on("second-instance", () => {
    if (!principal) return;
    if (principal.isMinimized()) principal.restore();
    principal.focus();
  });
  app.on("window-all-closed", () => app.quit());
  app.whenReady().then(() => {
    session.defaultSession.setSpellCheckerLanguages(["pt-BR"]);
    session.defaultSession.setPermissionRequestHandler((conteudo, permissao, responder) => {
      responder(PERMISSOES.has(permissao) && destinoDoLink(conteudo.getURL()) === "app");
    });
    principal = abrirJanela();
  });
}
