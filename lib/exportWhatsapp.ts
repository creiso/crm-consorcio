import { esconderDados, trocarNomes } from "./dadosPessoais";

// Lê os .txt de "Exportar conversa" do WhatsApp (Android e iPhone) para virar exemplo da IA.
// Roda no navegador do admin: o arquivo original nunca chega ao servidor, só o texto já limpo.

export const MAX_INSTRUCOES = 10_000;
export const MAX_EXEMPLOS = 60_000;

export type Arquivo = { nome: string; linhas: { quem: string; texto: string }[] };

const MENSAGEM = /^\[?\d{1,2}\/\d{1,2}\/\d{2,4},? \d{1,2}:\d{2}(?::\d{2})?\s?(?:[ap]\.?\s?m\.?)?\]?(?: -)? ([^:]+?): (.*)$/i;
const COMECA_COM_DATA = /^\[?\d{1,2}\/\d{1,2}\/\d{2,4}/;
// o que o WhatsApp escreve no lugar da mídia, e os avisos dele
const SEM_CONTEUDO = /^(<.*(ocult|omit|anexad).*>|.*(ocultad[oa]|omitid[oa]|omitted)|(esta )?mensagem (foi )?apagada|você apagou esta mensagem|this message was deleted|as mensagens e (as )?ligações são protegidas.*|null)$/i;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function lerExport(nome: string, conteudo: string): Arquivo {
  const linhas: Arquivo["linhas"] = [];
  for (const crua of conteudo.replace(/[‎‏‪‬﻿]/g, "").split(/\r?\n/)) {
    const m = crua.match(MENSAGEM);
    if (m) linhas.push({ quem: m[1].trim(), texto: m[2] });
    else if (crua.trim() && !COMECA_COM_DATA.test(crua) && linhas.length) linhas[linhas.length - 1].texto += "\n" + crua; // continuação da mensagem anterior
  }
  return { nome, linhas };
}

export const pessoasDe = (arquivos: Arquivo[]) => [...new Set(arquivos.flatMap((a) => a.linhas.map((l) => l.quem)))];

// Palpite de quem é da equipe: aparece em mais de um arquivo ou, com um arquivo só, não é a pessoa
// que dá nome ao arquivo ("Conversa do WhatsApp com Fulano.txt"). O admin confere na tela.
export function sugerirEquipe(arquivos: Arquivo[]) {
  const equipe = new Set<string>();
  for (const pessoa of pessoasDe(arquivos)) {
    const ondeAparece = arquivos.filter((a) => a.linhas.some((l) => l.quem === pessoa));
    const daNomeAoArquivo = ondeAparece.some((a) => norm(a.nome).includes(norm(pessoa)));
    const alguemDaNome = ondeAparece.some((a) => a.linhas.some((l) => norm(a.nome).includes(norm(l.quem))));
    if (ondeAparece.length > 1 || (!daNomeAoArquivo && alguemDaNome)) equipe.add(pessoa);
  }
  return equipe;
}

export function limparConversa(arquivo: Arquivo, equipe: Set<string>) {
  const pessoas = [...new Set(arquivo.linhas.map((l) => l.quem))];
  const clientes = pessoas.filter((p) => !equipe.has(p));
  const consultores = pessoas.filter((p) => equipe.has(p));
  return arquivo.linhas
    .map((l) => ({ quem: l.quem, texto: l.texto.replace(/\s*<(mensagem editada|this message was edited)>\s*$/i, "").trim() }))
    .filter((l) => l.texto && !SEM_CONTEUDO.test(l.texto))
    .map((l) => `${equipe.has(l.quem) ? "Consultor" : "Cliente"}: ${trocarNomes(trocarNomes(esconderDados(l.texto), clientes, "[nome]"), consultores, "[consultor]")}`)
    .join("\n");
}

export const juntarExemplos = (atuais: string, conversas: string[]) =>
  [atuais.trim(), ...conversas.filter(Boolean).map((c) => `--- conversa ---\n${c}`)].filter(Boolean).join("\n\n");
