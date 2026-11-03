"use client";
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";

type Mensagem = {
  id: string; telefone: string; direcao: "recebida" | "enviada"; origem: string; texto: string;
  status: string; erro: string | null; criada_em: string; leads: { nome: string } | null;
};
type Situacao = {
  sqlFaltando?: boolean; estado?: string; qr?: string | null; numero?: string | null; aviso?: string | null;
  visto_em?: string | null; online?: boolean; mensagens?: Mensagem[];
};

const ATUALIZA_MS = 5000;
const STATUS: Record<string, string> = {
  pendente: "⏳ na fila", enviando: "⏳ enviando", enviada: "✓ enviada",
  falhou: "✕ falhou", expirada: "✕ expirou na fila", recebida: "recebida",
};
const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
});

// Conexão do número (QR code) e teste de envio e recebimento.
export default function Whatsapp() {
  const [s, setS] = useState<Situacao | null>(null);
  const [imagemQr, setImagemQr] = useState<string | null>(null);
  const [telefone, setTelefone] = useState("");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/whatsapp", { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (r) setS(r);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, ATUALIZA_MS);
    return () => clearInterval(t);
  }, [load]);

  const conectado = !!s?.online && s.estado === "conectado";
  const qr = s?.online && s.estado === "qr" ? s.qr : null;

  useEffect(() => {
    if (!qr) return setImagemQr(null);
    QRCode.toDataURL(qr, { width: 280, margin: 2 }).then(setImagemQr).catch(() => setImagemQr(null));
  }, [qr]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro("");
    const r = await fetch("/api/whatsapp", { method: "POST", body: JSON.stringify({ telefone, texto }) });
    setEnviando(false);
    if (!r.ok) return setErro(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Não foi possível enviar.");
    setTexto("");
    load();
  }

  if (s?.sqlFaltando) return <div className="card vazio">Rode o SQL 016_whatsapp.sql no Supabase para ativar esta tela.</div>;

  return (
    <>
      <div className="dash-topo">
        <div>
          <h1>WhatsApp</h1>
          <p>Conexão do número e teste de envio e recebimento.</p>
        </div>
      </div>

      <div className="grid2">
        <div className="card" style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <h3 style={{ margin: 0 }}>Conexão</h3>
          {!s ? <span style={{ color: "var(--muted)" }}>Carregando…</span>
            : conectado ? <div className="wa-estado ok">✓ Conectado{s.numero ? ` · ${s.numero}` : ""}</div>
            : !s.online ? <div className="wa-estado off">✕ Conector desligado. Confira se o PC do escritório está ligado e com internet.</div>
            : qr ? (
              <>
                <div className="wa-estado aviso">📱 Aguardando a leitura do QR code</div>
                {imagemQr && <img src={imagemQr} alt="QR code do WhatsApp" width={280} height={280} className="wa-qr" />}
                <ol className="wa-passos">
                  <li>No celular do chip, abra o WhatsApp.</li>
                  <li>Toque em <b>Dispositivos conectados → Conectar dispositivo</b>.</li>
                  <li>Aponte a câmera para este código. Ele muda sozinho de tempos em tempos.</li>
                </ol>
              </>
            )
            : s.aviso ? <div className="wa-estado off">⚠ {s.aviso}</div>
            : <div className="wa-estado aviso">⏳ Conector ligado, conectando ao WhatsApp…</div>}
          {s?.visto_em && <small style={{ color: "var(--muted)" }}>Último contato do conector: {hora(s.visto_em)}</small>}
        </div>

        <div className="card" style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <h3 style={{ margin: 0 }}>Enviar mensagem de teste</h3>
          <form onSubmit={enviar} style={{ display: "grid", gap: 8 }}>
            <input placeholder="Telefone com DDD (ex.: 42 99906-0600)" value={telefone} onChange={(e) => setTelefone(e.target.value)} required />
            <textarea placeholder="Mensagem" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} required />
            {erro && <small style={{ color: "#b4232c" }}>{erro}</small>}
            <div><button className="btn" disabled={enviando}>{enviando ? "Colocando na fila…" : "Enviar"}</button></div>
          </form>
          {!conectado && s && <small style={{ color: "var(--muted)" }}>Fora do ar, a mensagem espera na fila por até 30 minutos.</small>}

          <h3 style={{ margin: "8px 0 0" }}>Últimas mensagens</h3>
          {!s?.mensagens?.length && <span style={{ color: "var(--muted)", fontSize: 13 }}>Nenhuma mensagem ainda.</span>}
          <div className="wa-lista">
            {s?.mensagens?.map((m) => (
              <div key={m.id} className={`wa-msg ${m.direcao}`}>
                <small>
                  {m.direcao === "recebida" ? "← " : "→ "}
                  {m.leads?.nome ?? m.telefone} · {hora(m.criada_em)}
                  {m.origem === "celular" && " · pelo celular"}
                  {m.direcao === "enviada" && ` · ${STATUS[m.status] ?? m.status}`}
                </small>
                <div>{m.texto}</div>
                {m.erro && <small className="wa-erro">{m.erro}</small>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
