"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Avatar from "../Avatar";

type Membro = { id: string; nome: string; foto_url: string | null; papel: string };
type Equipe = { id: string; nome: string; membros: Membro[] };
type Usuario = Membro & { equipe_id: string | null; ativo: boolean };

export default function Equipes() {
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [semEquipe, setSemEquipe] = useState<Usuario[]>([]);
  const [nova, setNova] = useState("");
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    const [e, u] = await Promise.all([fetch("/api/equipes").then((r) => r.json()), fetch("/api/usuarios").then((r) => r.json())]);
    setEquipes(Array.isArray(e) ? e : []);
    setSemEquipe((Array.isArray(u) ? u : []).filter((x: Usuario) => x.ativo && !x.equipe_id && x.papel !== "admin"));
  }
  useEffect(() => { load(); }, []);

  async function enviar(method: string, body: object, ok: string) {
    const r = await fetch("/api/equipes", { method, body: JSON.stringify(body) });
    const j = await r.json();
    setMsg(r.ok ? ok : `Erro: ${j.error}`);
    if (r.ok) load();
    return r.ok;
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (await enviar("POST", { nome: nova }, `Equipe "${nova}" criada. Coloque as pessoas nela pela tela Usuários.`)) setNova("");
  }

  async function renomear(e: React.FormEvent) {
    e.preventDefault();
    if (editando && (await enviar("PATCH", editando, "Equipe renomeada."))) setEditando(null);
  }

  function excluir(eq: Equipe) {
    if (!confirm(`Excluir a equipe "${eq.nome}"?\n\nOs ${eq.membros.length} membros ficam sem equipe. Leads e vendas continuam no sistema.`)) return;
    enviar("DELETE", { id: eq.id }, `Equipe "${eq.nome}" excluída.`);
  }

  const pessoas = (lista: Membro[]) => lista.length === 0
    ? <span className="equipe-vazio">ninguém</span>
    : lista.map((m) => (
      <span key={m.id} className="equipe-pessoa"><Avatar nome={m.nome} foto={m.foto_url} tamanho={24} />{m.nome}</span>
    ));

  return (
    <>
      <div className="dash-topo">
        <div>
          <h1>Equipes</h1>
          <p>Crie as equipes aqui; para colocar alguém numa equipe, use a tela <Link href="/usuarios">Usuários</Link>.</p>
        </div>
        <form onSubmit={criar} className="filtros">
          <input placeholder="Nome da nova equipe" value={nova} onChange={(e) => setNova(e.target.value)} required style={{ minWidth: 220 }} />
          <button className="btn">Criar equipe</button>
        </form>
      </div>
      {msg && <div className="card" style={{ marginBottom: 12 }}>{msg}</div>}

      {equipes.length === 0 && <div className="card vazio">Nenhuma equipe ainda. Crie a primeira acima.</div>}
      <div className="equipes-grid">
        {equipes.map((eq) => {
          const coords = eq.membros.filter((m) => m.papel === "coordenador");
          const vendedores = eq.membros.filter((m) => m.papel !== "coordenador");
          return (
            <div key={eq.id} className="card equipe-card">
              {editando?.id === eq.id ? (
                <form onSubmit={renomear} style={{ display: "flex", gap: 8 }}>
                  <input value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} autoFocus required />
                  <button className="btn">Salvar</button>
                  <button type="button" className="btn secondary" onClick={() => setEditando(null)}>Cancelar</button>
                </form>
              ) : (
                <div className="card-tit" style={{ marginBottom: 12 }}>
                  <h3>{eq.nome}</h3>
                  <span>{vendedores.length} {vendedores.length === 1 ? "consultor" : "consultores"}</span>
                </div>
              )}
              <div className="det-label">Coordenação</div>
              <div className="equipe-pessoas">{pessoas(coords)}</div>
              <div className="det-label">Consultores</div>
              <div className="equipe-pessoas">{pessoas(vendedores)}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button className="btn secondary" onClick={() => setEditando({ id: eq.id, nome: eq.nome })}>Renomear</button>
                <button className="btn secondary" onClick={() => excluir(eq)}>Excluir</button>
              </div>
            </div>
          );
        })}
        {semEquipe.length > 0 && (
          <div className="card equipe-card sem">
            <div className="card-tit" style={{ marginBottom: 12 }}>
              <h3>⚠ Sem equipe</h3>
              <Link href="/usuarios">definir em Usuários →</Link>
            </div>
            <div className="equipe-pessoas">{pessoas(semEquipe)}</div>
            <small style={{ color: "var(--muted)" }}>Quem está sem equipe só recebe leads de planilhas marcadas para "todas as equipes".</small>
          </div>
        )}
      </div>
    </>
  );
}
