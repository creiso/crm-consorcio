"use client";
import { useEffect, useState } from "react";

type Usuario = { id: string; nome: string; email: string | null; papel: string; ativo: boolean };

export default function Usuarios() {
  const [lista, setLista] = useState<Usuario[]>([]);
  const [f, setF] = useState({ nome: "", email: "", senha: "", papel: "vendedor" });
  const [msg, setMsg] = useState("");

  const load = async () => setLista(await (await fetch("/api/usuarios")).json());
  useEffect(() => { load(); }, []);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/usuarios", { method: "POST", body: JSON.stringify(f) });
    const j = await r.json();
    if (!r.ok) return setMsg(`Erro: ${j.error}`);
    setMsg(`Acesso criado. Passe para ${f.nome}: e-mail ${f.email} e a senha que você definiu.`);
    setF({ nome: "", email: "", senha: "", papel: "vendedor" });
    load();
  }

  async function ativar(u: Usuario, ativo: boolean) {
    const r = await fetch("/api/usuarios", { method: "PATCH", body: JSON.stringify({ id: u.id, ativo }) });
    if (!r.ok) setMsg(`Erro: ${(await r.json()).error}`);
    load();
  }

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
            <option value="vendedor">Vendedor — vê só os próprios leads</option>
            <option value="admin">Administrador — vê tudo e cadastra planilhas</option>
          </select>
          <button className="btn">Criar acesso</button>
        </form>
        <div className="card">
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead><tr style={{ textAlign: "left" }}><th>Nome</th><th>E-mail</th><th>Nível</th><th>Ativo</th></tr></thead>
            <tbody>
              {lista.map((u) => (
                <tr key={u.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: 6 }}>{u.nome}</td>
                  <td style={{ padding: 6 }}>{u.email}</td>
                  <td style={{ padding: 6 }}>{u.papel}</td>
                  <td style={{ padding: 6 }}><input type="checkbox" style={{ width: "auto" }} checked={u.ativo} onChange={(e) => ativar(u, e.target.checked)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
