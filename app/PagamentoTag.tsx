"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const LABEL = { aguardando: "⏳ Aguardando pagamento", concluido: "✓ Pagamento concluído", cancelado: "✕ Cancelado" } as const;
type P = keyof typeof LABEL;
const NEXT: Record<P, P> = { aguardando: "concluido", concluido: "cancelado", cancelado: "aguardando" };

// Clique alterna: aguardando → concluído → cancelado → aguardando
export default function PagamentoTag({ id, value, editavel }: { id: string; value: P; editavel: boolean }) {
  const [v, setV] = useState<P>(value);
  const router = useRouter();
  if (!editavel) return <span className={`tag ${v}`}>{LABEL[v]}</span>;
  async function toggle() {
    const novo = NEXT[v];
    setV(novo);
    await fetch("/api/vendas", { method: "PATCH", body: JSON.stringify({ id, pagamento: novo }) });
    router.refresh();
  }
  return <button className={`tag ${v}`} onClick={toggle} title="Clique para alterar">{LABEL[v]}</button>;
}
