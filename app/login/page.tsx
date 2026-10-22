"use client";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setBusy(false);
    if (error) return setErro("E-mail ou senha inválidos");
    window.location.href = "/";
  }

  return (
    <form onSubmit={entrar} className="card" style={{ maxWidth: 360, margin: "60px auto", display: "grid", gap: 10 }}>
      <h1 style={{ margin: 0 }}>Entrar</h1>
      <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} required />
      {erro && <small style={{ color: "#e3262f" }}>{erro}</small>}
      <button className="btn" disabled={busy}>Entrar</button>
      <small style={{ color: "#666" }}>Primeiro acesso do sistema? <a href="/setup">Criar administrador</a></small>
    </form>
  );
}
