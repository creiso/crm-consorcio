// Regras do app que não dependem da janela: para onde cada link vai e o que cada atalho faz.

export const ENDERECO = "https://crm-consorcio-seven.vercel.app";

const FORA_DO_APP = new Set(["http:", "https:", "mailto:", "tel:", "whatsapp:"]);

// "app" abre aqui dentro, "navegador" abre no programa padrão do Windows, "bloquear" não abre.
export function destinoDoLink(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return "bloquear";
  }
  if (u.origin === new URL(ENDERECO).origin) return "app";
  return FORA_DO_APP.has(u.protocol) ? "navegador" : "bloquear";
}

export function acaoDoTeclado({ type, key, control, alt }) {
  if (type !== "keyDown") return null;
  if (key === "F5" || (control && key.toLowerCase() === "r")) return "atualizar";
  if (key === "F11") return "telaCheia";
  if (control && (key === "+" || key === "=")) return "zoomMais";
  if (control && key === "-") return "zoomMenos";
  if (control && key === "0") return "zoomNormal";
  if (alt && key === "ArrowLeft") return "voltar";
  if (alt && key === "ArrowRight") return "avancar";
  return null;
}
