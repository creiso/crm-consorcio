"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import Turnstile, { SITE_KEY, type TurnstileRef } from "../Turnstile";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const turnstile = useRef<TurnstileRef>(null);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (SITE_KEY && !captcha) return setErro("Confirme a verificação “não sou um robô” antes de entrar");
    setBusy(true);
    setErro("");
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error } = await supabase.auth.signInWithPassword({
      email, password: senha, ...(captcha ? { options: { captchaToken: captcha } } : {}),
    });
    setBusy(false);
    if (error) {
      turnstile.current?.reset();
      return setErro(/captcha/i.test(error.message) ? "A verificação anti-robô falhou. Tente de novo." : "E-mail ou senha inválidos");
    }
    window.location.href = "/";
  }

  return (
    <form onSubmit={entrar} className="card" style={{ maxWidth: 360, margin: "60px auto", display: "grid", gap: 10 }}>
      <h1 style={{ margin: 0 }}>Entrar</h1>
      <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} required />
      <Turnstile ref={turnstile} onToken={setCaptcha} />
      {erro && <small style={{ color: "#e3262f" }}>{erro}</small>}
      <button className="btn" disabled={busy || (!!SITE_KEY && !captcha)}>{busy ? "Entrando…" : "Entrar"}</button>
      <small style={{ textAlign: "center" }}><Link href="/esqueci-senha">Esqueci minha senha</Link></small>
    </form>
  );
}
