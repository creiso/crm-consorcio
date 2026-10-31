"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Avatar from "../Avatar";

type Membro = { id: string; nome: string; foto_url: string | null; papel: string };
type Equipe = { id: string; nome: string; membros: Membro[] };
type Usuario = Membro & { equipe_id: string | null; ativo: boolean };
type Pedido = { id: string; created_at: string; vendedor_id: string; vendedores: { nome: string; email: string | null; foto_url: string | null } | null };

const haQuanto = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `há ${Math.max(min, 1)} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  return `há ${Math.round(min / 1440)} dias`;
};

// senha legível para o admin passar por WhatsApp/telefone (sem 0/O, 1/l)
function gerarSenha() {
  const letras = "abcdefghjkmnpqrstuvwxyz", numeros = "23456789";
  const pega = (s: string) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
  return Array.from({ length: 6 }, () => pega(letras)).join("") + Array.from({ length: 4 }, () => pega(numeros)).join("");
}

// Notificação de "esqueci minha senha": o admin define a senha nova ali mesmo.
function PedidosSenha({ pedidos, onFeito }: { pedidos: Pedido[]; onFeito: (msg: string) => void }) {
  const [senhas, setSenhas] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);
  if (!pedidos.length) return null;

  async function salvar(p: Pedido) {
    const senha = senhas[p.id] ?? "";
    if (senha.length < 8) return onFeito("Erro: a senha precisa ter pelo menos 8 caracteres.");
    setSalvando(p.id);
    const r = await fetch("/api/usuarios", { method: "PATCH", body: JSON.stringify({ id: p.vendedor_id, senha }) });
    setSalvando(null);
    const nome = p.vendedores?.nome ?? "a pessoa";
    onFeito(r.ok ? `✓ Senha de ${nome} trocada para “${senha}”. Passe essa senha para ${nome}.` : `Erro: ${(await r.json()).error}`);
  }
  async function dispensar(p: Pedido) {
    await fetch("/api/senha", { method: "PATCH", body: JSON.stringify({ id: p.id }) });
    onFeito(`Pedido de ${p.vendedores?.nome ?? "senha"} dispensado.`);
  }

  return (
    <div className="card pedidos-senha" style={{ marginBottom: 16 }}>
      <div className="card-tit">
        <h3>🔑 Pedidos de nova senha ({pedidos.length})</h3>
        <span>quem clicou em “Esqueci minha senha”</span>
      </div>
      {pedidos.map((p) => (
        <div key={p.id} className="pedido-senha">
          <Avatar nome={p.vendedores?.nome} foto={p.vendedores?.foto_url} tamanho={36} />
          <div style={{ minWidth: 0 }}>
            <b>{p.vendedores?.nome ?? "—"}</b>
            <small>{p.vendedores?.email} · pediu {haQuanto(p.created_at)}</small>
          </div>
          <div className="pedido-acoes">
            <input type="text" placeholder="Senha nova (mín. 8)" value={senhas[p.id] ?? ""} aria-label={`Senha nova de ${p.vendedores?.nome}`}
              onChange={(e) => setSenhas({ ...senhas, [p.id]: e.target.value })} />
            <button type="button" className="btn secondary" onClick={() => setSenhas({ ...senhas, [p.id]: gerarSenha() })}>Gerar</button>
            <button type="button" className="btn" disabled={salvando === p.id} onClick={() => salvar(p)}>
              {salvando === p.id ? "Salvando…" : "Definir senha"}
            </button>
            <button type="button" className="btn secondary" onClick={() => dispensar(p)}>Dispensar</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Equipes() {
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [semEquipe, setSemEquipe] = useState<Usuario[]>([]);
  const [nova, setNova] = useState("");
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [pedidos, setPedidos] = useState<Pedido[]>([]);

  async function load() {
    const [e, u, s] = await Promise.all([
      fetch("/api/equipes").then((r) => r.json()), fetch("/api/usuarios").then((r) => r.json()),
      fetch("/api/senha").then((r) => r.json()).catch(() => ({ pedidos: [] })),
    ]);
    setEquipes(Array.isArray(e) ? e : []);
    setPedidos(s.pedidos ?? []);
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
      <PedidosSenha pedidos={pedidos} onFeito={(m) => { setMsg(m); load(); }} />

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
