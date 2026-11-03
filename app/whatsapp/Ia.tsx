"use client";
import { useCallback, useEffect, useState } from "react";
import { MAX_EXEMPLOS, MAX_INSTRUCOES, juntarExemplos, lerExport, limparConversa, pessoasDe, sugerirEquipe, type Arquivo } from "@/lib/exportWhatsapp";

type Conversa = {
  chave: string; telefone: string; ia_pausada: boolean; motivo: string | null; aguardando_ia: boolean;
  ultima_recebida_em: string | null; leads: { nome: string } | null;
};
type Situacao = {
  sqlFaltando?: boolean; modo?: Modo; numeros_teste?: string[]; instrucoes?: string; exemplos?: string;
  erro?: string | null; erro_em?: string | null; modelo?: string; chaveConfigurada?: boolean; respostasHoje?: number; conversas?: Conversa[];
};
type Modo = "desligada" | "teste" | "ligada";
type Turno = { de: "cliente" | "equipe"; texto: string; nota?: string };

const ATUALIZA_MS = 10000;
const MODELO_INSTRUCOES = `Empresa:
Administradora do consórcio:
Seu nome na conversa (ex.: Ana, assistente virtual da equipe):
O que vendemos (imóvel, carro, moto, serviços):
Próximo passo com o cliente (ex.: reunião com um consultor):
Horário dos consultores:

Perguntas frequentes e respostas:
- `;
const MODOS: { id: Modo; titulo: string; texto: string }[] = [
  { id: "desligada", titulo: "Desligada", texto: "Ninguém recebe resposta da IA. As mensagens de leads avisam o consultor no Kanban." },
  { id: "teste", titulo: "Só números de teste", texto: "A IA responde apenas os números listados abaixo. Comece por aqui." },
  { id: "ligada", titulo: "Ligada para os leads", texto: "A IA responde quem é lead, nas etapas Lead, Em atendimento, Quente e Frio. Outros números não recebem resposta dela." },
];
const AVISO_LIGADA = "No plano grátis do Gemini, o Google pode usar e pessoas podem ler o que é enviado, e os termos dele pedem para não enviar dados pessoais. "
  + "O CRM esconde nome, telefone, CPF e e-mail, mas outras informações que o cliente escrever podem passar.\n\nLigar a IA para os leads mesmo assim?";
const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
});

// IA que responde no WhatsApp: como funciona, o que ela sabe, teste sem enviar e conversas.
export default function Ia() {
  const [s, setS] = useState<Situacao | null>(null);
  const [modo, setModo] = useState<Modo>("teste");
  const [numeros, setNumeros] = useState("");
  const [instrucoes, setInstrucoes] = useState("");
  const [exemplos, setExemplos] = useState("");
  const [carregado, setCarregado] = useState(false);
  const [alterado, setAlterado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/whatsapp/ia", { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null) as Situacao | null;
    if (r) setS(r);
    return r;
  }, []);

  useEffect(() => {
    load().then((r) => {
      if (!r || r.sqlFaltando) return;
      setModo(r.modo ?? "teste");
      setNumeros((r.numeros_teste ?? []).join(", "));
      setInstrucoes(r.instrucoes || MODELO_INSTRUCOES);
      setExemplos(r.exemplos ?? "");
      setCarregado(true);
    });
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, ATUALIZA_MS);
    return () => clearInterval(t);
  }, [load]);

  async function salvar() {
    if (modo === "ligada" && s?.modo !== "ligada" && !window.confirm(AVISO_LIGADA)) return false;
    setSalvando(true);
    setAviso(null);
    const r = await fetch("/api/whatsapp/ia", { method: "PUT", body: JSON.stringify({ modo, numeros_teste: numeros, instrucoes, exemplos }) });
    const j = await r.json().catch(() => ({})) as { error?: string; numeros_teste?: string[] };
    setSalvando(false);
    if (!r.ok) {
      setAviso({ ok: false, texto: j.error ?? "Não foi possível salvar." });
      return false;
    }
    setNumeros((j.numeros_teste ?? []).join(", "));
    setAlterado(false);
    setAviso({ ok: true, texto: "Salvo." });
    load();
    return true;
  }

  const mudou = <T,>(f: (v: T) => void) => (v: T) => { f(v); setAlterado(true); };

  async function conversa(chave: string, acao: "pausar" | "devolver") {
    await fetch("/api/whatsapp/conversa", { method: "PATCH", body: JSON.stringify({ chave, acao }) });
    load();
  }

  if (!s) return null;
  if (s.sqlFaltando) return <div className="card vazio" style={{ marginTop: 16 }}>Rode o SQL 017_whatsapp_ia.sql no Supabase para ativar a IA.</div>;
  if (!carregado) return null;

  return (
    <div className="grid2" style={{ marginTop: 16 }}>
      <div className="card" style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <h3 style={{ margin: 0 }}>IA que responde</h3>
        {s.chaveConfigurada === false && <div className="wa-estado off">✕ Falta cadastrar a chave do Gemini na Vercel. Sem ela a IA não responde.</div>}
        {s.erro && <div className="wa-estado off">⚠ {s.erro}{s.erro_em ? ` (${hora(s.erro_em)})` : ""}</div>}
        <small style={{ color: "var(--muted)" }}>{s.respostasHoje ?? 0} respostas da IA nas últimas 24 h · modelo {s.modelo}</small>

        <div className="wa-opcoes">
          {MODOS.map((m) => (
            <label key={m.id} className="wa-opcao">
              <input type="radio" name="modo-ia" checked={modo === m.id} onChange={() => mudou(setModo)(m.id)} />
              <span><b>{m.titulo}</b><small>{m.texto}</small></span>
            </label>
          ))}
        </div>

        <label className="wa-campo">
          Números de teste
          <input placeholder="42 99906-0600, 11 98888-7777" value={numeros} onChange={(e) => mudou(setNumeros)(e.target.value)} />
          <small>A IA responde estes números em qualquer modo, menos Desligada, mesmo que não sejam leads.</small>
        </label>

        <label className="wa-campo">
          O que a IA precisa saber
          <textarea rows={11} maxLength={MAX_INSTRUCOES} value={instrucoes} onChange={(e) => mudou(setInstrucoes)(e.target.value)} />
          <small>Só o que ela pode dizer ao cliente. O que não estiver aqui ela passa para o consultor, em vez de inventar.</small>
        </label>

        <Exemplos valor={exemplos} onChange={mudou(setExemplos)} />

        {aviso && <small style={{ color: aviso.ok ? "#006300" : "#b4232c" }}>{aviso.texto}</small>}
        <div><button className="btn" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar"}</button></div>
      </div>

      <div style={{ display: "grid", gap: 16, alignContent: "start", minWidth: 0 }}>
        <Simulador salvarAntes={alterado ? salvar : null} />

        <div className="card" style={{ display: "grid", gap: 4 }}>
          <h3 style={{ margin: "0 0 4px" }}>Conversas</h3>
          {!s.conversas?.length && <span style={{ color: "var(--muted)", fontSize: 13 }}>Nenhuma conversa ainda.</span>}
          {s.conversas?.map((c) => (
            <div key={c.chave} className="wa-conversa">
              <span>
                <b>{c.leads?.nome ?? c.telefone}</b>
                <small>
                  {c.ia_pausada ? `👤 Com consultor${c.motivo ? ` · ${c.motivo}` : ""}` : c.aguardando_ia ? "⏳ Esperando a IA" : "🤖 IA pode responder"}
                  {c.ultima_recebida_em ? ` · ${hora(c.ultima_recebida_em)}` : ""}
                </small>
              </span>
              <button className="btn secondary" onClick={() => conversa(c.chave, c.ia_pausada ? "devolver" : "pausar")}>
                {c.ia_pausada ? "Devolver para a IA" : "Pausar IA"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Conversas exportadas do WhatsApp viram exemplos. A limpeza roda aqui no navegador.
function Exemplos({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const [arquivos, setArquivos] = useState<Arquivo[]>([]);
  const [equipe, setEquipe] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState("");

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const lista = [...(e.target.files ?? [])];
    e.target.value = "";
    setErro("");
    const lidos = (await Promise.all(lista.map(async (f) => lerExport(f.name, await f.text())))).filter((a) => a.linhas.length);
    if (!lidos.length) return setErro("Não encontrei mensagens nesse arquivo. Use o .txt de \"Exportar conversa\" do WhatsApp.");
    setArquivos(lidos);
    setEquipe(sugerirEquipe(lidos));
  }

  function adicionar() {
    onChange(juntarExemplos(valor, arquivos.map((a) => limparConversa(a, equipe))));
    setArquivos([]);
  }

  return (
    <div className="wa-campo">
      Exemplos de conversas boas
      <small>No WhatsApp: abra a conversa &gt; Mais &gt; Exportar conversa &gt; Sem mídia. No iPhone, abra o .zip e use o .txt de dentro. Nomes, telefones, CPFs e e-mails são trocados antes de sair do seu computador.</small>
      <input type="file" accept=".txt,text/plain" multiple onChange={escolher} />
      {erro && <small style={{ color: "#b4232c" }}>{erro}</small>}
      {arquivos.length > 0 && (
        <div className="wa-estado aviso" style={{ display: "grid", gap: 8, fontWeight: 400 }}>
          <b>Quem é da sua equipe nestas conversas?</b>
          <div className="wa-pessoas">
            {pessoasDe(arquivos).map((p) => (
              <label key={p}>
                <input type="checkbox" checked={equipe.has(p)} onChange={(e) => {
                  const nova = new Set(equipe);
                  if (e.target.checked) nova.add(p);
                  else nova.delete(p);
                  setEquipe(nova);
                }} />
                {p}
              </label>
            ))}
          </div>
          <div><button type="button" className="btn secondary" onClick={adicionar}>Limpar e adicionar {arquivos.length} conversa{arquivos.length > 1 ? "s" : ""}</button></div>
        </div>
      )}
      <textarea rows={8} placeholder={"Cliente: Oi, vi o anúncio\nConsultor: Oi, [nome]! Você busca imóvel ou carro?"} value={valor} onChange={(e) => onChange(e.target.value)} />
      <small style={{ color: valor.length > MAX_EXEMPLOS ? "#b4232c" : undefined }}>
        {valor.length.toLocaleString("pt-BR")} de {MAX_EXEMPLOS.toLocaleString("pt-BR")} caracteres. Confira o texto antes de salvar: um nome de terceiro ou um endereço escrito no meio da conversa pode ter ficado.
      </small>
    </div>
  );
}

// Conversa de mentira com a IA: usa a configuração salva e não envia nada no WhatsApp.
function Simulador({ salvarAntes }: { salvarAntes: (() => Promise<boolean>) | null }) {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [pensando, setPensando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (salvarAntes && !(await salvarAntes())) return;
    const novos: Turno[] = [...turnos, { de: "cliente", texto }];
    setTurnos(novos);
    setTexto("");
    setErro("");
    setPensando(true);
    const r = await fetch("/api/whatsapp/ia/simular", { method: "POST", body: JSON.stringify({ mensagens: novos }) });
    const j = await r.json().catch(() => ({})) as { error?: string; resposta?: string; transferir?: boolean; motivo?: string };
    setPensando(false);
    if (!r.ok) return setErro(j.error ?? "A IA não respondeu.");
    setTurnos([...novos, {
      de: "equipe", texto: j.resposta || "(sem mensagem)",
      nota: j.transferir ? `Passaria para o consultor: ${j.motivo || "sem motivo informado"}` : undefined,
    }]);
  }

  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Testar sem enviar</h3>
        {turnos.length > 0 && <button className="btn secondary" onClick={() => { setTurnos([]); setErro(""); }}>Recomeçar</button>}
      </div>
      <small style={{ color: "var(--muted)" }}>Escreva como se fosse o cliente. Nada sai no WhatsApp, mas o texto vai para o Gemini: não use dados reais.</small>
      {turnos.length > 0 && (
        <div className="wa-lista">
          {turnos.map((t, i) => (
            <div key={i} className={`wa-msg ${t.de === "cliente" ? "recebida" : "enviada"}`}>
              <small>{t.de === "cliente" ? "Cliente" : "🤖 IA"}</small>
              <div>{t.texto}</div>
              {t.nota && <small className="wa-erro">{t.nota}</small>}
            </div>
          ))}
          {pensando && <span style={{ color: "var(--muted)", fontSize: 13 }}>A IA está escrevendo…</span>}
        </div>
      )}
      <form onSubmit={enviar} style={{ display: "grid", gap: 6 }}>
        <textarea rows={2} placeholder="Oi, vi o anúncio. Como funciona?" value={texto} onChange={(e) => setTexto(e.target.value)} required />
        {erro && <small style={{ color: "#b4232c" }}>{erro}</small>}
        <div><button className="btn" disabled={pensando}>Enviar para a IA</button></div>
      </form>
    </div>
  );
}
