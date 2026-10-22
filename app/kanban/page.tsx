"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { STATUSES, LeadStatus, brl } from "@/lib/supabase";

type Lead = {
  id: string; nome: string; telefone: string | null; email: string | null; cidade: string | null;
  interesse: string | null; valor_pretendido: number | null; status: LeadStatus; observacoes: string | null;
  created_at: string; updated_at: string; vendedor_id: string | null; vendedores: { nome: string } | null;
  dados_extras: Record<string, unknown> | null;
};
type Vendedor = { id: string; nome: string };

const ATUALIZA_MS = 10000;

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[_\-\s?]+/g, " ").trim();

// Busca nas colunas extras da planilha pela parte do nome (ex: "renda" acha "renda_mensal").
function extra(l: Lead, palavras: string[]) {
  for (const [k, v] of Object.entries(l.dados_extras ?? {})) {
    if (palavras.some((p) => norm(k).includes(p)) && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

const renda = (l: Lead) => extra(l, ["renda", "salario"]);
const conhece = (l: Lead) => extra(l, ["conhece"]);

// Data de entrada do lead: "created_time" do Facebook, senão a data em que entrou no sistema.
function criadoEm(l: Lead) {
  const d = new Date(extra(l, ["created time", "data de criacao"]) ?? l.created_at);
  return isNaN(d.getTime()) ? new Date(l.created_at) : d;
}

const fmtData = (d: Date, completo = false) =>
  d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "short",
    ...(completo ? { year: "numeric" } : {}), hour: "2-digit", minute: "2-digit",
  });

function whatsapp(tel: string | null) {
  const d = (tel ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return `https://wa.me/${d.length <= 11 ? "55" + d : d}`;
}

const iniciais = (nome?: string) => (nome ?? "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

export default function Kanban() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [over, setOver] = useState<string | null>(null);
  const [vendaLead, setVendaLead] = useState<Lead | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [admin, setAdmin] = useState(false);
  const [novos, setNovos] = useState<Set<string>>(new Set());
  const vistos = useRef<Set<string> | null>(null);
  const arrastando = useRef(false);

  const load = useCallback(async () => {
    if (arrastando.current) return; // não mexe no quadro no meio de um arraste
    const r = await fetch("/api/leads", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (!r?.leads) return;
    const lista: Lead[] = r.leads;

    // destaca leads que chegaram depois da primeira carga
    if (vistos.current) {
      const chegaram = lista.filter((l) => !vistos.current!.has(l.id)).map((l) => l.id);
      if (chegaram.length) {
        setNovos((s) => new Set([...s, ...chegaram]));
        setTimeout(() => setNovos((s) => { const n = new Set(s); chegaram.forEach((id) => n.delete(id)); return n; }), 15000);
      }
    }
    vistos.current = new Set(lista.map((l) => l.id));
    setLeads(lista);
    setVendedores(r.vendedores ?? []);
    setAdmin(r.perfil?.papel === "admin");
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

  async function patch(id: string, body: Record<string, unknown>) {
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...body } : l)));
    await fetch("/api/leads", { method: "PATCH", body: JSON.stringify({ id, ...body }) });
    load();
  }

  function mover(id: string, status: LeadStatus) {
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.status === status) return;
    if (status === "venda") return setVendaLead(lead);
    patch(id, { status });
  }

  const q = norm(busca);
  const filtrados = leads.filter((l) => norm(`${l.nome} ${l.telefone ?? ""} ${l.email ?? ""} ${l.cidade ?? ""}`).includes(q));
  const leadAberto = leads.find((l) => l.id === aberto) ?? null;

  return (
    <>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Kanban de leads</h1>
        <input placeholder="Buscar nome, telefone, cidade" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ maxWidth: 320 }} />
        <span className="ao-vivo"><i /> ao vivo</span>
      </div>
      <div className="board">
        {STATUSES.map((s) => {
          const items = filtrados.filter((l) => l.status === s.id);
          return (
            <div
              key={s.id}
              className={`col ${over === s.id ? "over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setOver(s.id); }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => { setOver(null); arrastando.current = false; mover(e.dataTransfer.getData("id"), s.id); }}
            >
              <h3>{s.label} <span>{items.length}</span></h3>
              {items.map((l) => {
                const valor = l.valor_pretendido ? brl(Number(l.valor_pretendido)) : renda(l);
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
                    {l.cidade && <small>📍 {l.cidade}</small>}
                    <div className="lead-rodape">
                      <small>{fmtData(criadoEm(l))}</small>
                      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {wa && <a href={wa} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="WhatsApp" className="ico-wa">💬</a>}
                        {l.vendedores
                          ? <span className="avatar" title={l.vendedores.nome}>{iniciais(l.vendedores.nome)}</span>
                          : <span className="avatar vazio" title="Sem vendedor">!</span>}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {leadAberto && (
        <Detalhe
          lead={leadAberto} admin={admin} vendedores={vendedores}
          onClose={() => setAberto(null)}
          onStatus={(status) => mover(leadAberto.id, status)}
          onVendedor={(vendedor_id) => patch(leadAberto.id, { vendedor_id: vendedor_id || null })}
        />
      )}
      {vendaLead && (
        <VendaModal lead={vendaLead} vendedores={vendedores} onClose={() => setVendaLead(null)} onSaved={() => { setVendaLead(null); load(); }} />
      )}
    </>
  );
}

// Painel lateral com os dados do lead.
function Detalhe({ lead, admin, vendedores, onClose, onStatus, onVendedor }: {
  lead: Lead; admin: boolean; vendedores: Vendedor[];
  onClose: () => void; onStatus: (s: LeadStatus) => void; onVendedor: (id: string) => void;
}) {
  const wa = whatsapp(lead.telefone);
  const usados = ["renda", "salario", "conhece", "created time", "data de criacao"];
  const outros = Object.entries(lead.dados_extras ?? {}).filter(([k, v]) => v !== null && String(v) !== "" && !usados.some((u) => norm(k).includes(u)));

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
          {linha("Valor do consórcio", lead.valor_pretendido ? brl(Number(lead.valor_pretendido)) : null)}
          {linha("Renda / salário", renda(lead))}
          {linha("Cidade", lead.cidade)}
          {linha("Conhece consórcio", conhece(lead))}
          {linha("Criado em", fmtData(criadoEm(lead), true) + " (Brasília)")}
          {linha("Telefone", lead.telefone)}
          {linha("E-mail", lead.email)}
          {lead.interesse && linha("Interesse", lead.interesse)}
          {lead.observacoes && linha("Observações", lead.observacoes)}
        </section>

        <section style={{ display: "grid", gap: 8 }}>
          <label className="det-label">Etapa</label>
          <select value={lead.status} onChange={(e) => onStatus(e.target.value as LeadStatus)}>
            {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <label className="det-label">Vendedor</label>
          {admin ? (
            <select value={lead.vendedor_id ?? ""} onChange={(e) => onVendedor(e.target.value)}
              style={{ borderColor: lead.vendedor_id ? "#ccc" : "#e3262f" }}>
              <option value="">⚠ Sem vendedor</option>
              {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          ) : <b>{lead.vendedores?.nome ?? "—"}</b>}
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
          <option value="">Vendedor que realizou…</option>
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
