"use client";
import { useEffect, useState } from "react";
import { STATUSES, LeadStatus, brl } from "@/lib/supabase";

type Lead = {
  id: string; nome: string; telefone: string | null; email: string | null;
  interesse: string | null; valor_pretendido: number | null; status: LeadStatus;
  updated_at: string; vendedores: { nome: string } | null;
};
type Vendedor = { id: string; nome: string };

export default function Kanban() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [over, setOver] = useState<string | null>(null);
  const [vendaLead, setVendaLead] = useState<Lead | null>(null);
  const [busca, setBusca] = useState("");

  async function load() {
    const r = await (await fetch("/api/leads")).json();
    setLeads(r.leads ?? []);
    setVendedores(r.vendedores ?? []);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // leads novos da planilha aparecem sozinhos
    return () => clearInterval(t);
  }, []);

  async function mover(id: string, status: LeadStatus) {
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.status === status) return;
    if (status === "venda") return setVendaLead(lead);
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, status } : l)));
    await fetch("/api/leads", { method: "PATCH", body: JSON.stringify({ id, status }) });
  }

  const filtrados = leads.filter((l) =>
    `${l.nome} ${l.telefone ?? ""} ${l.email ?? ""}`.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Kanban de leads</h1>
        <input placeholder="Buscar nome, telefone, e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ maxWidth: 320 }} />
        <button className="btn secondary" onClick={load}>Atualizar</button>
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
              onDrop={(e) => { setOver(null); mover(e.dataTransfer.getData("id"), s.id); }}
            >
              <h3>{s.label} <span>{items.length}</span></h3>
              {items.map((l) => (
                <div key={l.id} className="lead" draggable onDragStart={(e) => e.dataTransfer.setData("id", l.id)}>
                  <strong>{l.nome}</strong>
                  {l.telefone && <small>{l.telefone}</small>}
                  {l.interesse && <small>{l.interesse}</small>}
                  {l.valor_pretendido && <small>{brl(Number(l.valor_pretendido))}</small>}
                  {l.vendedores && <small>👤 {l.vendedores.nome}</small>}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {vendaLead && (
        <VendaModal lead={vendaLead} vendedores={vendedores} onClose={() => setVendaLead(null)} onSaved={() => { setVendaLead(null); load(); }} />
      )}
    </>
  );
}

function VendaModal({ lead, vendedores, onClose, onSaved }: {
  lead: Lead; vendedores: Vendedor[]; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState({ vendedor_id: "", valor: String(lead.valor_pretendido ?? ""), tipo: "imovel", grupo: "", cota: "" });
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
