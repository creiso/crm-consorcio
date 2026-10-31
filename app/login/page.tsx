"use client";
import { useRef, useState } from "react";
import Script from "next/script";
import { createBrowserClient } from "@supabase/ssr";

// Cloudflare Turnstile ("não sou um robô"). O token vai junto no login e quem confere é o próprio
// Supabase (Authentication → Attack Protection → CAPTCHA com Turnstile e a Secret Key).
// Sem NEXT_PUBLIC_TURNSTILE_SITE_KEY o widget não aparece e o login funciona como antes.
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type Turnstile = {
  render: (el: HTMLElement, opcoes: Record<string, unknown>) => string;
  reset: (id: string) => void;
};
declare global { interface Window { turnstile?: Turnstile } }

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  function montarWidget() {
    if (!SITE_KEY || !window.turnstile || !caixa.current || widget.current) return;
    widget.current = window.turnstile.render(caixa.current, {
      sitekey: SITE_KEY, language: "pt-br", theme: "light",
      callback: (token: string) => setCaptcha(token),
      "expired-callback": () => setCaptcha(null),
      "error-callback": () => setCaptcha(null),
    });
  }

  // cada token vale uma vez só: depois de uma tentativa, pede um novo
  function novoDesafio() {
    if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
    setCaptcha(null);
  }

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
      novoDesafio();
      return setErro(/captcha/i.test(error.message) ? "A verificação anti-robô falhou. Tente de novo." : "E-mail ou senha inválidos");
    }
    window.location.href = "/";
  }

  return (
    <form onSubmit={entrar} className="card" style={{ maxWidth: 360, margin: "60px auto", display: "grid", gap: 10 }}>
      <h1 style={{ margin: 0 }}>Entrar</h1>
      <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} required />
      {SITE_KEY && (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={montarWidget} />
          <div ref={caixa} className="turnstile" />
        </>
      )}
      {erro && <small style={{ color: "#e3262f" }}>{erro}</small>}
      <button className="btn" disabled={busy || (!!SITE_KEY && !captcha)}>{busy ? "Entrando…" : "Entrar"}</button>
      <small style={{ color: "#666" }}>Primeiro acesso do sistema? <a href="/setup">Criar administrador</a></small>
    </form>
  );
}
