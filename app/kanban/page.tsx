"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { STATUSES, LeadStatus, brl } from "@/lib/supabase";
import Avatar from "../Avatar";

type Lead = {
  id: string; nome: string; telefone: string | null; email: string | null; cidade: string | null;
  interesse: string | null; valor_pretendido: number | null; status: LeadStatus; observacoes: string | null;
  renda: string | null; valor_consorcio: string | null; conhece_consorcio: string | null;
  plataforma: string | null; campanha: string | null; conjunto: string | null; anuncio: string | null; formulario: string | null;
  criado_em: string | null; created_at: string; updated_at: string;
  vendedor_id: string | null; vendedores: { nome: string; foto_url: string | null } | null;
  equipe_id: string | null; equipes: { nome: string } | null;
  reuniao_em?: string | null; reuniao_status?: "agendada" | "feita" | "nao_compareceu" | null; reuniao_remarcacoes?: number | null;
  dados_extras: Record<string, unknown> | null;
};
type CorpoReuniao = { status?: "reuniao"; reuniao: { acao: "agendar" | "feita" | "nao_compareceu"; em?: string } };
type Vendedor = { id: string; nome: string; papel?: string; equipe_id?: string | null };
type Equipe = { id: string; nome: string };

const ATUALIZA_MS = 10000;
const POR_PAGINA = 50;
const PLATAFORMA: Record<string, string> = { ig: "Instagram", fb: "Facebook", msg: "Messenger", an: "Audience Network", wa: "WhatsApp" };

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Leads antigos (antes da próxima sincronização) ainda têm estes dados só nas colunas extras da planilha.
function extra(l: Lead, palavras: string[]) {
  for (const [k, v] of Object.entries(l.dados_extras ?? {})) {
    if (palavras.some((p) => norm(k).includes(p)) && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

const renda = (l: Lead) => l.renda ?? extra(l, ["renda", "salario"]);
const conhece = (l: Lead) => l.conhece_consorcio ?? extra(l, ["conhece", "sabe como funciona"]);
const valorConsorcio = (l: Lead) => (l.valor_pretendido ? brl(Number(l.valor_pretendido)) : l.valor_consorcio);
const plataforma = (l: Lead) => (l.plataforma ? PLATAFORMA[l.plataforma] ?? l.plataforma : null);
const simNao = (v: unknown) => (String(v).toLowerCase() === "true" ? "sim" : String(v).toLowerCase() === "false" ? "não" : null);

// Quando o lead foi criado de verdade (created_time da planilha); sem isso, quando entrou no sistema.
function criadoEm(l: Lead) {
  const d = new Date(l.criado_em ?? extra(l, ["created time"]) ?? l.created_at);
  return isNaN(d.getTime()) ? new Date(l.created_at) : d;
}

const fmtData = (d: Date, completo = false) =>
  d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "short",
    ...(completo ? { year: "numeric" } : {}), hour: "2-digit", minute: "2-digit",
  });

// "qui., 30 out. · 14:00" no horário de Brasília
const fmtReuniao = (iso: string) => {
  const d = new Date(iso);
  const dia = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "short" });
  return `${dia} · ${d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}`;
};
function falta(iso: string) {
  const min = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (min < 60) return `em ${Math.max(min, 1)} min`;
  if (min < 24 * 60) return `em ${Math.round(min / 60)} h`;
  return `em ${Math.round(min / 1440)} dias`;
}
const reuniaoPassou = (l: Lead) => !!l.reuniao_em && new Date(l.reuniao_em).getTime() <= Date.now();

// Selo da reunião no card e no painel. Depois do horário liberam "feita" e "não apareceu".
function SeloReuniao({ lead, onFeita, onNaoVeio, onRemarcar }: {
  lead: Lead; onFeita: () => void; onNaoVeio: () => void; onRemarcar: () => void;
}) {
  if (!lead.reuniao_em || !lead.reuniao_status) return null;
  const parar = (f: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); f(); };
  if (lead.reuniao_status === "feita")
    return <div className="reuniao feita">✓ Reunião feita · {fmtReuniao(lead.reuniao_em)}</div>;
  if (lead.reuniao_status === "nao_compareceu")
    return (
      <>
        <div className="reuniao faltou">✕ Não compareceu · {fmtReuniao(lead.reuniao_em)}</div>
        <div className="reuniao-acoes"><button onClick={parar(onRemarcar)}>📅 Remarcar</button></div>
      </>
    );
  if (!reuniaoPassou(lead))
    return <div className="reuniao agendada">📅 {fmtReuniao(lead.reuniao_em)} <em>{falta(lead.reuniao_em)}</em></div>;
  return (
    <>
      <div className="reuniao pendente">⏰ Reunião {fmtReuniao(lead.reuniao_em)} — como foi?</div>
      <div className="reuniao-acoes">
        <button className="ok" onClick={parar(onFeita)}>✓ Feita</button>
        <button className="nao" onClick={parar(onNaoVeio)}>✕ Não apareceu / remarcou</button>
      </div>
    </>
  );
}

function whatsapp(tel: string | null) {
  const d = (tel ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return `https://wa.me/${d.length <= 11 ? "55" + d : d}`;
}


export default function Kanban() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [over, setOver] = useState<string | null>(null);
  const [vendaLead, setVendaLead] = useState<Lead | null>(null);
  const [reuniaoLead, setReuniaoLead] = useState<{ lead: Lead; modo: "agendar" | "nao_compareceu" } | null>(null);
  const [aviso, setAviso] = useState("");
  const [faltaSqlReuniao, setFaltaSqlReuniao] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [papel, setPapel] = useState<string>("vendedor");
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [minhaEquipe, setMinhaEquipe] = useState<string | null>(null);
  const [filtroEquipe, setFiltroEquipe] = useState("");
  const [novos, setNovos] = useState<Set<string>>(new Set());
  const [totais, setTotais] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState<string | null>(null);
  const limitesRef = useRef<Record<string, number>>({}); // quantos leads cada coluna mostra
  const buscaRef = useRef("");
  const equipeRef = useRef("");
  const maisRecente = useRef<string | null>(null);
  const arrastando = useRef(false);

  const load = useCallback(async () => {
    if (arrastando.current) return; // não mexe no quadro no meio de um arraste
    const params = new URLSearchParams();
    STATUSES.forEach((s) => params.set(s.id, String(limitesRef.current[s.id] ?? POR_PAGINA)));
    if (buscaRef.current) params.set("q", buscaRef.current);
    if (equipeRef.current) params.set("equipe", equipeRef.current);
    const r = await fetch(`/api/leads?${params}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (!r?.leads || arrastando.current) return;
    const lista: Lead[] = r.leads;

    // destaca só leads criados depois do mais recente já visto (não os que vieram pelo "carregar mais")
    const topo = lista.reduce<string | null>((m, l) => (!m || l.created_at > m ? l.created_at : m), null);
    if (maisRecente.current && !buscaRef.current) {
      const chegaram = lista.filter((l) => l.created_at > maisRecente.current!).map((l) => l.id);
      if (chegaram.length) {
        setNovos((s) => new Set([...s, ...chegaram]));
        setTimeout(() => setNovos((s) => { const n = new Set(s); chegaram.forEach((id) => n.delete(id)); return n; }), 15000);
      }
    }
    if (topo && (!maisRecente.current || topo > maisRecente.current)) maisRecente.current = topo;
    setLeads(lista);
    setTotais(r.totais ?? {});
    setFaltaSqlReuniao((r.colunasComErro ?? []).includes("reuniao"));
    setVendedores(r.vendedores ?? []);
    setEquipes(r.equipes ?? []);
    setPapel(r.perfil?.papel ?? "vendedor");
    setMinhaEquipe(r.perfil?.equipe_id ?? null);
  }, []);

  // Atualiza sozinho a cada 10s enquanto a aba está visível, e na hora ao voltar para a aba.
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, ATUALIZA_MS);
    const voltar = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", voltar);
    window.addEventListener("focus", voltar);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", voltar); window.removeEventListener("focus", voltar); };
  }, [load]);

  // busca no servidor, esperando a pessoa parar de digitar
  useEffect(() => {
    const t = setTimeout(() => { buscaRef.current = busca.trim(); load(); }, 350);
    return () => clearTimeout(t);
  }, [busca, load]);

  async function carregarMais(status: string) {
    setCarregando(status);
    const novo = { ...limitesRef.current, [status]: (limitesRef.current[status] ?? POR_PAGINA) + POR_PAGINA };
    limitesRef.current = novo;
    await load();
    setCarregando(null);
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...body } : l)));
    await fetch("/api/leads", { method: "PATCH", body: JSON.stringify({ id, ...body }) });
    load();
  }

  function mover(id: string, status: LeadStatus) {
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.status === status) return;
    if (status === "venda") return setVendaLead(lead);
    if (status === "reuniao") return setReuniaoLead({ lead, modo: "agendar" }); // pede data e horário
    patch(id, { status });
  }

  // agendar / feita / não apareceu: devolve a mensagem de erro (ou null se deu certo)
  async function enviarReuniao(lead: Lead, corpo: CorpoReuniao) {
    const r = await fetch("/api/leads", { method: "PATCH", body: JSON.stringify({ id: lead.id, ...corpo }) });
    if (!r.ok) return ((await r.json().catch(() => ({}))) as { error?: string }).error ?? "não foi possível salvar";
    load();
    return null;
  }
  async function reuniaoFeita(lead: Lead) {
    const erro = await enviarReuniao(lead, { reuniao: { acao: "feita" } });
    if (erro) { setAviso(erro); setTimeout(() => setAviso(""), 5000); }
  }

  function filtrarEquipe(v: string) {
    setFiltroEquipe(v);
    equipeRef.current = v;
    load();
  }

  const leadAberto = leads.find((l) => l.id === aberto) ?? null;
  const lider = papel === "admin" || papel === "coordenador";
  const nomeEquipe = (id: string | null | undefined) => equipes.find((e) => e.id === id)?.nome;

  return (
    <>
      <div className="kanban-tela">
        <div className="kanban-topo">
          <h1 style={{ margin: 0 }}>Kanban de leads</h1>
          {papel === "coordenador" && <span className="pill-equipe">{nomeEquipe(minhaEquipe) ?? "sem equipe"}</span>}
          <input placeholder="Buscar nome, telefone, cidade" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ maxWidth: 320 }} />
          {papel === "admin" && equipes.length > 0 && (
            <select value={filtroEquipe} onChange={(e) => filtrarEquipe(e.target.value)} style={{ maxWidth: 220 }} aria-label="Filtrar por equipe">
              <option value="">Todas as equipes</option>
              {equipes.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              <option value="sem">Sem equipe</option>
            </select>
          )}
          <span className="ao-vivo"><i /> ao vivo</span>
          {faltaSqlReuniao && papel === "admin" && (
            <span className="pill-aviso">⚠ Rode o SQL 009_reuniao.sql no Supabase para ativar a coluna Reunião agendada</span>
          )}
        </div>
        <div className="board">
          {STATUSES.map((s) => {
            const items = leads.filter((l) => l.status === s.id);
            const total = Math.max(totais[s.id] ?? 0, items.length);
            return (
              <div
                key={s.id}
                className={`col ${over === s.id ? "over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setOver(s.id); }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => { setOver(null); arrastando.current = false; mover(e.dataTransfer.getData("id"), s.id); }}
              >
                <h3>{s.label} <span>{total}</span></h3>
                {items.map((l) => {
                  const valor = valorConsorcio(l);
                  const rendaLead = valor ? null : renda(l);
                  const origem = plataforma(l);
                  const wa = whatsapp(l.telefone);
                  return (
                    <div
                      key={l.id}
                      className={`lead ${novos.has(l.id) ? "novo" : ""} ${!l.vendedor_id ? "sem-dono" : ""}`}
                      draggable
                      onDragStart={(e) => { arrastando.current = true; e.dataTransfer.setData("id", l.id); }}
                      onDragEnd={() => { arrastando.current = false; }}
                      onClick={() => setAberto(l.id)}
                    >
                      <div className="lead-top">
                        <strong>{l.nome}</strong>
                        {novos.has(l.id) && <span className="badge-novo">novo</span>}
                      </div>
                      {valor && <div className="lead-valor">{valor}</div>}
                      {rendaLead && <div className="lead-valor"><span className="lead-rotulo">Renda</span> {rendaLead}</div>}
                      {l.cidade && <small>📍 {l.cidade}</small>}
                      {l.status === "reuniao" && (
                        <SeloReuniao lead={l} onFeita={() => reuniaoFeita(l)}
                          onNaoVeio={() => setReuniaoLead({ lead: l, modo: "nao_compareceu" })}
                          onRemarcar={() => setReuniaoLead({ lead: l, modo: "agendar" })} />
                      )}
                      <div className="lead-rodape">
                        <small>{fmtData(criadoEm(l))}{origem ? ` · ${origem}` : ""}</small>
                        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {wa && <a href={wa} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="WhatsApp" className="ico-wa">💬</a>}
                          {l.vendedores
                            ? <Avatar nome={l.vendedores.nome} foto={l.vendedores.foto_url} />
                            : <span className="avatar vazio" title="Sem consultor">!</span>}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {total > items.length && (
                  <button className="btn secondary mais" disabled={carregando === s.id} onClick={() => carregarMais(s.id)}>
                    {carregando === s.id ? "Carregando…" : `Carregar mais (${total - items.length} restantes)`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {leadAberto && (
        <Detalhe
          lead={leadAberto} lider={lider} mostrarEquipe={papel === "admin"} vendedores={vendedores} nomeEquipe={nomeEquipe}
          onClose={() => setAberto(null)}
          onStatus={(status) => mover(leadAberto.id, status)}
          onVendedor={(vendedor_id) => patch(leadAberto.id, { vendedor_id: vendedor_id || null })}
          onReuniao={(modo) => setReuniaoLead({ lead: leadAberto, modo })}
          onReuniaoFeita={() => reuniaoFeita(leadAberto)}
        />
      )}
      {reuniaoLead && (
        <ReuniaoModal {...reuniaoLead} onClose={() => setReuniaoLead(null)}
          enviar={async (corpo) => {
            const erro = await enviarReuniao(reuniaoLead.lead, corpo);
            if (!erro) setReuniaoLead(null);
            return erro;
          }} />
      )}
      {aviso && <div className="aviso-flutuante" role="status">{aviso}</div>}
      {vendaLead && (
        <VendaModal lead={vendaLead} vendedores={vendedores} onClose={() => setVendaLead(null)} onSaved={() => { setVendaLead(null); load(); }} />
      )}
    </>
  );
}

// Painel lateral com os dados do lead.
// Admin e coordenador (líderes) trocam o vendedor; o coordenador só recebe a lista da equipe dele.
function Detalhe({ lead, lider, mostrarEquipe, vendedores, nomeEquipe, onClose, onStatus, onVendedor, onReuniao, onReuniaoFeita }: {
  lead: Lead; lider: boolean; mostrarEquipe: boolean; vendedores: Vendedor[]; nomeEquipe: (id?: string | null) => string | undefined;
  onClose: () => void; onStatus: (s: LeadStatus) => void; onVendedor: (id: string) => void;
  onReuniao: (modo: "agendar" | "nao_compareceu") => void; onReuniaoFeita: () => void;
}) {
  const wa = whatsapp(lead.telefone);
  // o que já aparece nas seções acima não se repete em "outros dados"
  const usados = ["renda", "salario", "conhece", "sabe como funciona", "created time", "valor do consorcio",
    "platform", "campaign name", "adset name", "ad name", "form name", "is organic"];
  const outros = Object.entries(lead.dados_extras ?? {}).filter(([k, v]) => v !== null && String(v) !== "" && !usados.some((u) => norm(k).includes(u)));
  const organico = simNao(lead.dados_extras?.is_organic);
  const temOrigem = lead.plataforma || lead.campanha || lead.conjunto || lead.anuncio || lead.formulario;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const linha = (rotulo: string, valor: React.ReactNode) => (
    <div className="det-linha"><span>{rotulo}</span><b>{valor || "—"}</b></div>
  );

  return (
    <div className="drawer-bg" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>{lead.nome}</h2>
          <button className="btn secondary" onClick={onClose}>✕</button>
        </div>

        {wa && <a className="btn btn-wa" href={wa} target="_blank" rel="noreferrer">💬 Chamar no WhatsApp</a>}

        <section>
          {linha("Valor do consórcio", valorConsorcio(lead))}
          {linha("Renda mensal", renda(lead))}
          {linha("Cidade", lead.cidade)}
          {linha("Conhece consórcio", conhece(lead))}
          {linha("Criado em", fmtData(criadoEm(lead), true) + " (Brasília)")}
          {linha("Telefone", lead.telefone)}
          {linha("E-mail", lead.email)}
          {lead.interesse && linha("Interesse", lead.interesse)}
          {lead.observacoes && linha("Observações", lead.observacoes)}
        </section>

        {lead.reuniao_em && lead.reuniao_status && (
          <section>
            <div className="det-label" style={{ marginBottom: 6 }}>Reunião</div>
            <SeloReuniao lead={lead} onFeita={onReuniaoFeita} onNaoVeio={() => onReuniao("nao_compareceu")} onRemarcar={() => onReuniao("agendar")} />
            {!!lead.reuniao_remarcacoes && <small style={{ color: "var(--muted)", display: "block", marginTop: 6 }}>Remarcada {lead.reuniao_remarcacoes}×</small>}
            {lead.reuniao_status === "agendada" && !reuniaoPassou(lead) && (
              <div className="reuniao-acoes"><button onClick={() => onReuniao("agendar")}>Alterar horário</button></div>
            )}
          </section>
        )}

        {temOrigem && (
          <section>
            <div className="det-label" style={{ marginBottom: 4 }}>Origem do lead</div>
            {linha("Plataforma", [plataforma(lead), organico === "sim" ? "orgânico" : organico === "não" ? "anúncio pago" : null].filter(Boolean).join(" · "))}
            {lead.campanha && linha("Campanha", lead.campanha)}
            {lead.conjunto && linha("Conjunto", lead.conjunto)}
            {lead.anuncio && linha("Anúncio", lead.anuncio)}
            {lead.formulario && linha("Formulário", lead.formulario)}
          </section>
        )}

        <section style={{ display: "grid", gap: 8 }}>
          <label className="det-label">Etapa</label>
          <select value={lead.status} onChange={(e) => onStatus(e.target.value as LeadStatus)}>
            {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          {mostrarEquipe && <>
            <label className="det-label">Equipe</label>
            <b>{lead.equipes?.nome ?? "Sem equipe"}</b>
          </>}
          <label className="det-label">Consultor</label>
          {lider ? (
            <select value={lead.vendedor_id ?? ""} onChange={(e) => onVendedor(e.target.value)}
              style={{ borderColor: lead.vendedor_id ? "#ccc" : "#e3262f" }}>
              <option value="">⚠ Sem consultor</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}{v.papel === "coordenador" ? " (coord.)" : ""}{mostrarEquipe && nomeEquipe(v.equipe_id) ? ` — ${nomeEquipe(v.equipe_id)}` : ""}
                </option>
              ))}
            </select>
          ) : (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Avatar nome={lead.vendedores?.nome} foto={lead.vendedores?.foto_url} tamanho={28} />
              <b>{lead.vendedores?.nome ?? "—"}</b>
            </span>
          )}
        </section>

        {outros.length > 0 && (
          <details>
            <summary className="det-label" style={{ cursor: "pointer" }}>Outros dados da planilha ({outros.length})</summary>
            {outros.map(([k, v]) => linha(k, String(v)))}
          </details>
        )}
      </aside>
    </div>
  );
}

function VendaModal({ lead, vendedores, onClose, onSaved }: {
  lead: Lead; vendedores: Vendedor[]; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState({ vendedor_id: lead.vendedor_id ?? (vendedores.length === 1 ? vendedores[0].id : ""), valor: String(lead.valor_pretendido ?? ""), tipo: "imovel", grupo: "", cota: "" });
  const [erro, setErro] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function salvar() {
    const r = await fetch("/api/vendas", {
      method: "POST",
      body: JSON.stringify({ ...f, lead_id: lead.id, valor: Number(f.valor.replace(/\./g, "").replace(",", ".")) }),
    });
    if (r.ok) onSaved(); else setErro((await r.json()).error);
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0 }}>Registrar venda — {lead.nome}</h3>
        <select value={f.vendedor_id} onChange={set("vendedor_id")}>
          <option value="">Consultor que realizou…</option>
          {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
        </select>
        <input placeholder="Valor do consórcio (ex: 100000,00)" value={f.valor} onChange={set("valor")} />
        <select value={f.tipo} onChange={set("tipo")}>
          <option value="imovel">Imóvel</option>
          <option value="automovel">Automóvel</option>
          <option value="servicos">Serviços</option>
        </select>
        <div style={{ display: "flex", gap: 8 }}>
          <input placeholder="Grupo" value={f.grupo} onChange={set("grupo")} />
          <input placeholder="Cota" value={f.cota} onChange={set("cota")} />
        </div>
        {erro && <small style={{ color: "#e3262f" }}>{erro}</small>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn secondary" onClick={onClose}>Cancelar</button>
          <button className="btn" onClick={salvar}>Salvar venda</button>
        </div>
      </div>
    </div>
  );
}

// Agendar (ou trocar o horário) e "não apareceu": com nova data remarca, sem data só registra a falta.
function ReuniaoModal({ lead, modo, onClose, enviar }: {
  lead: Lead; modo: "agendar" | "nao_compareceu"; onClose: () => void;
  enviar: (corpo: CorpoReuniao) => Promise<string | null>;
}) {
  // valor do campo datetime-local no horário do computador de quem está usando
  const paraCampo = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const pendenteFutura = lead.reuniao_status === "agendada" && !reuniaoPassou(lead);
  const [quando, setQuando] = useState(modo === "agendar" && pendenteFutura && lead.reuniao_em ? paraCampo(lead.reuniao_em) : "");
  const [remarcar, setRemarcar] = useState(true);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const precisaData = modo === "agendar" || remarcar;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (precisaData && !quando) return setErro("Escolha a data e o horário");
    setBusy(true);
    const em = precisaData ? new Date(quando).toISOString() : undefined;
    const msg = await enviar(modo === "agendar"
      ? { status: "reuniao", reuniao: { acao: "agendar", em } }
      : { reuniao: { acao: "nao_compareceu", em } });
    setBusy(false);
    if (msg) setErro(msg);
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
        <h3 style={{ margin: 0 }}>
          {modo === "agendar" ? (pendenteFutura ? "Alterar horário da reunião" : "Agendar reunião") : "Cliente não apareceu"} — {lead.nome}
        </h3>
        {modo === "nao_compareceu" && (
          <div className="seg" style={{ width: "fit-content" }}>
            <button type="button" className={remarcar ? "on" : ""} onClick={() => setRemarcar(true)}>📅 Remarcou</button>
            <button type="button" className={!remarcar ? "on" : ""} onClick={() => setRemarcar(false)}>Sem nova data</button>
          </div>
        )}
        {precisaData && (
          <label style={{ display: "grid", gap: 6 }}>
            <span className="det-label">{modo === "agendar" ? "Data e horário da reunião" : "Nova data e horário"}</span>
            <input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} required autoFocus />
          </label>
        )}
        <small style={{ color: "var(--muted)" }}>
          {modo === "agendar"
            ? "Depois desse horário o card libera os botões “Reunião feita” e “Não apareceu / remarcou”."
            : remarcar ? "A falta fica registrada e a reunião volta para a agenda na nova data." : "A falta fica registrada; dá para remarcar depois pelo card."}
        </small>
        {erro && <small style={{ color: "#b4232c" }}>{erro}</small>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
          <button className="btn" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button>
        </div>
      </form>
    </div>
  );
}
