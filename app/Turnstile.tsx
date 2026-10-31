"use client";
import { forwardRef, useImperativeHandle, useRef } from "react";
import Script from "next/script";

// Cloudflare Turnstile ("não sou um robô"). Quem confere o token é o próprio Supabase
// (Authentication → Attack Protection → CAPTCHA com Turnstile e a Secret Key).
// Sem NEXT_PUBLIC_TURNSTILE_SITE_KEY o widget não aparece e as telas funcionam sem ele.
export const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type Api = { render: (el: HTMLElement, opcoes: Record<string, unknown>) => string; reset: (id: string) => void };
declare global { interface Window { turnstile?: Api } }

export type TurnstileRef = { reset: () => void };

const Turnstile = forwardRef<TurnstileRef, { onToken: (token: string | null) => void }>(function Turnstile({ onToken }, ref) {
  const caixa = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  // cada token vale uma vez só: depois de uma tentativa, a tela pede um novo
  useImperativeHandle(ref, () => ({
    reset() {
      if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
      onToken(null);
    },
  }));

  function montar() {
    if (!SITE_KEY || !window.turnstile || !caixa.current || widget.current) return;
    widget.current = window.turnstile.render(caixa.current, {
      sitekey: SITE_KEY, language: "pt-br", theme: "light",
      callback: (token: string) => onToken(token),
      "expired-callback": () => onToken(null),
      "error-callback": () => onToken(null),
    });
  }

  if (!SITE_KEY) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={montar} />
      <div ref={caixa} className="turnstile" />
    </>
  );
});

export default Turnstile;
