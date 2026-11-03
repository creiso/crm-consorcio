// Esconde o que identifica alguém antes de um texto sair do CRM para a IA.
// Valores como "R$ 150.000" e "3000" ficam: a IA precisa deles.

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const CARTAO = /(?<!\d)(?:\d{4}[ -]?){3}\d{4}(?!\d)/g;
const CPF_CNPJ = /(?<!\d)(?:\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.\d{3}\.\d{3}-?\d{2}|\d{9}-\d{2})(?!\d)/g;
const CEP = /(?<!\d)\d{5}-\d{3}(?!\d)/g;
const TELEFONE = /(?<!\d)(?:(?:\+\s?)?55[\s.-]*)?(?:\(?\d{2}\)?[\s.-]*)?\d{4,5}[\s.-]?\d{4}(?!\d)/g;
const NUMERO_LONGO = /(?<!\d)\d{8,}(?!\d)/g;
const LIGACOES = new Set(["de", "da", "do", "dos", "das"]);

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

export function esconderDados(texto: string) {
  return texto
    .replace(EMAIL, "[email]")
    .replace(CARTAO, "[numero]")
    .replace(CPF_CNPJ, "[cpf]")
    .replace(CEP, "[cep]")
    .replace(TELEFONE, "[telefone]")
    .replace(NUMERO_LONGO, "[numero]");
}

// Troca cada parte dos nomes conhecidos pelo rótulo: "Maria de Souza" esconde "Maria" e "Souza".
export function trocarNomes(texto: string, nomes: (string | null | undefined)[], rotulo: string) {
  const partes = new Set<string>();
  for (const nome of nomes) {
    for (const p of (nome ?? "").split(/\s+/)) {
      const parte = p.replace(/[^\p{L}]/gu, "");
      if (parte.length < 3 || LIGACOES.has(parte.toLowerCase())) continue;
      partes.add(parte);
      partes.add(semAcento(parte));
    }
  }
  if (!partes.size) return texto;
  const opcoes = [...partes].sort((a, b) => b.length - a.length).join("|");
  return texto.replace(new RegExp(`(?<!\\p{L})(?:${opcoes})(?!\\p{L})`, "giu"), rotulo);
}

// A IA escreve [nome] e o CRM troca pelo primeiro nome: assim o nome do lead nunca vai para a IA.
export function colocarNome(texto: string, nomeCompleto: string | null | undefined) {
  const primeiro = (nomeCompleto ?? "").trim().split(/\s+/)[0] ?? "";
  if (!/^\p{L}{2,}$/u.test(primeiro)) return texto.replace(/,?\s*\[nome\]/gi, "");
  return texto.replace(/\[nome\]/gi, primeiro[0].toUpperCase() + primeiro.slice(1).toLowerCase());
}
