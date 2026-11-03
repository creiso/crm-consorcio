"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Mensagem = { id: string; direcao: "recebida" | "enviada"; origem: string; texto: string; status: string; erro: string | null; criada_em: string };
type Dados = {
  sqlFaltando?: boolean; semTelefone?: boolean;
  conversa?: { ia_pausada: boolean; motivo: string | null; aguardando_ia: boolean } | null;
  mensagens?: Mensagem[];
};

const ATUALIZA_MS = 5000;
const STATUS: Record<string, string> = { pendente: "⏳ na fila", enviando: "⏳ enviando", falhou: "✕ falhou", expirada: "✕ expirou na fila" };
const AUTOR: Record<string, string> = { ia: "🤖 IA", crm: "Consultor", celular: "Pelo celular" };
const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
});

// Conversa do lead no WhatsApp do chip: o que a IA disse, resposta do consultor e passagem de bastão.
export default function ConversaWhatsapp({ leadId, status, motivo }: { leadId: string; status?: string | null; motivo?: string | null }) {
  const [d, setD] = useState<Dados | null>(null);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [visto, setVisto] = useState(false);
  const lista = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/whatsapp/conversa?lead=${leadId}`, { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (r) setD(r);
  }, [leadId]);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, ATUALIZA_MS);
    return () => clearInterval(t);
  }, [load]);

  const total = d?.mensagens?.length ?? 0;
  useEffect(() => { if (lista.current) lista.current.scrollTop = lista.current.scrollHeight; }, [total]);

  async function chamar(metodo: "POST" | "PATCH", corpo: object) {
    setOcupado(true);
    setErro("");
    const r = await fetch("/api/whatsapp/conversa", { method: metodo, body: JSON.stringify({ lead: leadId, ...corpo }) });
    setOcupado(false);
    if (!r.ok) {
      setErro(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Não foi possível concluir.");
      return false;
    }
    await load();
    return true;
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (await chamar("POST", { texto })) setTexto("");
  }

  if (!d || d.sqlFaltando || d.semTelefone) return null;
  const pausada = !!d.conversa?.ia_pausada;
  const temConversa = total > 0 || !!d.conversa;

  return (
    <section style={{ display: "grid", gap: 8 }}>
      <div className="det-label">Conversa no WhatsApp</div>

      {status === "aguardando" && !visto && (
        <div className="wa-estado aviso" style={{ display: "grid", gap: 6 }}>
          <span>🔔 {motivo || "Cliente esperando resposta"}</span>
          <div>
            <button className="btn secondary" disabled={ocupado} onClick={async () => { if (await chamar("PATCH", { acao: "visto" })) setVisto(true); }}>
              Já atendi por fora
            </button>
          </div>
        </div>
      )}

      {temConversa && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span>{pausada ? `👤 Com consultor${d.conversa?.motivo ? ` · ${d.conversa.motivo}` : ""}` : "🤖 A IA pode responder esta conversa"}</span>
          <button className="btn secondary" style={{ flexShrink: 0 }} disabled={ocupado} onClick={() => chamar("PATCH", { acao: pausada ? "devolver" : "pausar" })}>
            {pausada ? "Devolver para a IA" : "Assumir"}
          </button>
        </div>
      )}

      {total > 0 && (
        <div className="wa-lista" ref={lista} style={{ maxHeight: 280 }}>
          {d.mensagens?.map((m) => (
            <div key={m.id} className={`wa-msg ${m.direcao}`}>
              <small>
                {m.direcao === "recebida" ? "Cliente" : AUTOR[m.origem] ?? "Equipe"} · {hora(m.criada_em)}
                {STATUS[m.status] ? ` · ${STATUS[m.status]}` : ""}
              </small>
              <div>{m.texto}</div>
              {m.erro && <small className="wa-erro">{m.erro}</small>}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={enviar} style={{ display: "grid", gap: 6 }}>
        <textarea rows={2} placeholder="Responder pelo número do CRM (a IA para nesta conversa)" value={texto} onChange={(e) => setTexto(e.target.value)} required />
        {erro && <small style={{ color: "#b4232c" }}>{erro}</small>}
        <div><button className="btn" disabled={ocupado}>Enviar</button></div>
      </form>
    </section>
  );
}
