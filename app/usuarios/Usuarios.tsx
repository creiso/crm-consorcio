"use client";
import { useEffect, useState } from "react";
import Avatar from "../Avatar";
import FotoUpload from "../FotoUpload";

type Usuario = {
  id: string; nome: string; email: string | null; papel: string; ativo: boolean; na_roleta: boolean;
  foto_url: string | null; equipe_id: string | null;
};
type Equipe = { id: string; nome: string };

const NOVO = { nome: "", email: "", senha: "", papel: "vendedor", equipe_id: "" };

export default function Usuarios() {
  const [lista, setLista] = useState<Usuario[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [f, setF] = useState(NOVO);
  const [msg, setMsg] = useState("");
  const [fotoDe, setFotoDe] = useState<Usuario | null>(null);

  async function load() {
    const [u, e] = await Promise.all([fetch("/api/usuarios").then((r) => r.json()), fetch("/api/equipes").then((r) => r.json())]);
    setLista(Array.isArray(u) ? u : []);
    setEquipes(Array.isArray(e) ? e : []);
  }
  useEffect(() => { load(); }, []);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/usuarios", { method: "POST", body: JSON.stringify(f) });
    const j = await r.json();
    if (!r.ok) return setMsg(`Erro: ${j.error}`);
    setMsg(`Acesso criado. Passe para ${f.nome}: e-mail ${f.email} e a senha que você definiu.`);
    setF(NOVO);
    load();
  }

  async function alterar(u: Usuario, patch: Partial<Pick<Usuario, "ativo" | "na_roleta" | "papel" | "equipe_id">>) {
    const r = await fetch("/api/usuarios", { method: "PATCH", body: JSON.stringify({ id: u.id, ...patch }) });
    setMsg(r.ok ? "" : `Erro: ${(await r.json()).error}`);
    load();
  }

  const seletorEquipe = (valor: string, onChange: (v: string) => void, obrigatorio = false) => (
    <select value={valor} onChange={(e) => onChange(e.target.value)} required={obrigatorio}>
      <option value="">{obrigatorio ? "Escolha a equipe…" : "Sem equipe"}</option>
      {equipes.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
    </select>
  );

  return (
    <>
      <h1>Usuários</h1>
      {msg && <div className="card" style={{ marginBottom: 12 }}>{msg}</div>}
      <div className="grid2">
        <form onSubmit={criar} className="card" style={{ display: "grid", gap: 10, alignContent: "start" }}>
          <h3 style={{ margin: 0 }}>Novo acesso</h3>
          <input placeholder="Nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required />
          <input type="email" placeholder="E-mail" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
          <input type="text" placeholder="Senha inicial (mín. 8)" value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} required minLength={8} />
          <select value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value })}>
            <option value="vendedor">Consultor — atende os próprios leads</option>
            <option value="coordenador">Coordenador — lidera uma equipe, fora da roleta</option>
            <option value="admin">Administrador — vê tudo e cadastra</option>
          </select>
          {f.papel !== "admin" && seletorEquipe(f.equipe_id, (v) => setF({ ...f, equipe_id: v }), f.papel === "coordenador")}
          <button className="btn">Criar acesso</button>
          <small style={{ color: "var(--muted)" }}>
            O coordenador vê o dashboard, o kanban e o placar só da equipe dele, distribui leads dentro dela e não cadastra nada.
          </small>
        </form>
        <div className="card" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead><tr style={{ textAlign: "left" }}><th>Nome</th><th>Nível</th><th>Equipe</th><th>Na roleta</th><th>Ativo</th></tr></thead>
            <tbody>
              {lista.map((u) => (
                <tr key={u.id} style={{ borderTop: "1px solid #eee", opacity: u.ativo ? 1 : 0.55 }}>
                  <td style={{ padding: 6 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <button type="button" onClick={() => setFotoDe(u)} title="Trocar foto"
                        style={{ border: 0, padding: 0, background: "none", cursor: "pointer" }}>
                        <Avatar nome={u.nome} foto={u.foto_url} tamanho={32} />
                      </button>
                      <span>{u.nome}<br /><small style={{ color: "var(--muted)" }}>{u.email}</small></span>
                    </span>
                  </td>
                  <td style={{ padding: 6, minWidth: 140 }}>
                    <select value={u.papel} onChange={(e) => alterar(u, { papel: e.target.value })}>
                      <option value="vendedor">Consultor</option>
                      <option value="coordenador">Coordenador</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </td>
                  <td style={{ padding: 6, minWidth: 150 }}>
                    {u.papel === "admin" ? <span style={{ color: "var(--muted)" }}>todas</span>
                      : seletorEquipe(u.equipe_id ?? "", (v) => alterar(u, { equipe_id: v || null }))}
                  </td>
                  <td style={{ padding: 6 }}>
                    {u.papel === "vendedor"
                      ? <input type="checkbox" style={{ width: "auto" }} checked={u.na_roleta} onChange={(e) => alterar(u, { na_roleta: e.target.checked })} />
                      : <span style={{ color: "var(--muted)" }}>—</span>}
                  </td>
                  <td style={{ padding: 6 }}><input type="checkbox" style={{ width: "auto" }} checked={u.ativo} onChange={(e) => alterar(u, { ativo: e.target.checked })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {fotoDe && (
        <div className="modal-bg" onClick={() => setFotoDe(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0 }}>Foto de {fotoDe.nome}</h3>
            <FotoUpload id={fotoDe.id} nome={fotoDe.nome} foto={fotoDe.foto_url} onChange={() => load()} />
            <button className="btn" onClick={() => setFotoDe(null)}>Fechar</button>
          </div>
        </div>
      )}
    </>
  );
}
