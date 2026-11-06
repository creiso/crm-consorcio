"use client";
import { useState } from "react";
import Link from "next/link";

// Sem e-mail automático: o pedido vira uma notificação para o admin na tela Equipes,
// e o admin define a senha nova e passa para a pessoa.
export default function EsqueciSenha() {
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function pedir(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErro("");
    const r = await fetch("/api/senha", { method: "POST", body: JSON.stringify({ email }) });
    setBusy(false);
    if (!r.ok) return setErro(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Não foi possível enviar o pedido.");
    setEnviado(true);
  }

  if (enviado)
    return (
      <div className="card" style={{ maxWidth: 380, margin: "60px auto", display: "grid", gap: 12 }}>
        <img src="/onioncrm.png" alt="OnionCRM" className="logo-entrada" />
        <h1 style={{ margin: 0 }}>Pedido enviado ✓</h1>
        <p style={{ margin: 0, color: "var(--muted)" }}>
          O administrador foi avisado e vai definir uma senha nova para você. Assim que ele te passar a senha, é só entrar com ela.
        </p>
        <Link className="btn secondary" href="/login" style={{ textDecoration: "none" }}>Voltar para o login</Link>
      </div>
    );

  return (
    <form onSubmit={pedir} className="card" style={{ maxWidth: 380, margin: "60px auto", display: "grid", gap: 10 }}>
      <img src="/onioncrm.png" alt="OnionCRM" className="logo-entrada" />
      <h1 style={{ margin: 0 }}>Esqueci minha senha</h1>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
        Informe o e-mail que você usa para entrar. O administrador recebe o pedido e define uma senha nova para você.
      </p>
      <input type="email" placeholder="Seu e-mail" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      {erro && <small style={{ color: "#e3262f" }}>{erro}</small>}
      <button className="btn" disabled={busy}>{busy ? "Enviando…" : "Pedir nova senha ao administrador"}</button>
      <small style={{ textAlign: "center" }}><Link href="/login">Voltar para o login</Link></small>
    </form>
  );
}
