"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// [ícone, texto completo, texto curto para celular]
const LABEL = {
  aguardando: ["⏳", "Aguardando pagamento", "Aguardando"],
  concluido: ["✓", "Pagamento concluído", "Pago"],
  cancelado: ["✕", "Cancelado", "Cancelado"],
} as const;
type P = keyof typeof LABEL;
const NEXT: Record<P, P> = { aguardando: "concluido", concluido: "cancelado", cancelado: "aguardando" };

function Rotulo({ v }: { v: P }) {
  const [icone, longo, curto] = LABEL[v];
  return <>{icone} <span className="longo">{longo}</span><span className="curto">{curto}</span></>;
}

// Clique alterna: aguardando → concluído → cancelado → aguardando
export default function PagamentoTag({ id, value, editavel }: { id: string; value: P; editavel: boolean }) {
  const [v, setV] = useState<P>(value);
  const router = useRouter();
  if (!editavel) return <span className={`tag ${v}`}><Rotulo v={v} /></span>;
  async function toggle() {
    const novo = NEXT[v];
    setV(novo);
    await fetch("/api/vendas", { method: "PATCH", body: JSON.stringify({ id, pagamento: novo }) });
    router.refresh();
  }
  return <button className={`tag ${v}`} onClick={toggle} title="Clique para alterar"><Rotulo v={v} /></button>;
}
