"use client";
import { useState } from "react";

// Só funciona enquanto não existir nenhum administrador.
export default function Setup() {
  const [f, setF] = useState({ nome: "", email: "", senha: "" });
  const [msg, setMsg] = useState("");

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/setup", { method: "POST", body: JSON.stringify(f) });
    const j = await r.json();
    setMsg(r.ok ? "ok" : j.error);
  }

  if (msg === "ok")
    return <div className="card" style={{ maxWidth: 360, margin: "60px auto" }}>Administrador criado! <a href="/login">Fazer login</a></div>;

  return (
    <form onSubmit={criar} className="card" style={{ maxWidth: 360, margin: "60px auto", display: "grid", gap: 10 }}>
      <h1 style={{ margin: 0 }}>Criar administrador</h1>
      <input placeholder="Seu nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required />
      <input type="email" placeholder="E-mail" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
      <input type="password" placeholder="Senha (mín. 8 caracteres)" value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} required minLength={8} />
      {msg && <small style={{ color: "#e3262f" }}>{msg}</small>}
      <button className="btn">Criar</button>
    </form>
  );
}
