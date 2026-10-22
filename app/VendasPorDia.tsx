"use client";
import { useState } from "react";

export type Dia = { dia: number; rotulo: string; total: number; qtd: number };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const compacto = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(v);

// Topo do eixo em número "redondo" (passos de 1, 2, 2,5 ou 5 × 10^n), com no máximo 4 faixas.
function escala(max: number) {
  if (max <= 0) return [0, 1];
  const bruto = max / 4;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((f) => f * pot).find((p) => p >= bruto)!;
  const topo = Math.ceil(max / passo) * passo;
  return Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo);
}

// Colunas de volume vendido por dia do mês: uma série, uma cor; o dia de maior volume ganha rótulo.
export default function VendasPorDia({ dias, hoje }: { dias: Dia[]; hoje: number | null }) {
  const [foco, setFoco] = useState<number | null>(null);
  const max = Math.max(0, ...dias.map((d) => d.total));
  const ticks = escala(max);
  const topo = ticks[ticks.length - 1];
  const melhor = dias.find((d) => d.total === max && max > 0);
  const marcados = new Set([1, 5, 10, 15, 20, 25, dias.length]);
  const atual = foco !== null ? dias[foco] : null;

  if (max === 0) return <div className="vazio">Nenhuma venda registrada neste mês ainda.</div>;

  return (
    <figure className="viz">
      <div className="viz-plot">
        {ticks.map((t) => (
          <div key={t} className={`viz-grid ${t === 0 ? "base" : ""}`} style={{ bottom: `${(t / topo) * 100}%` }}>
            <span>{t === 0 ? "0" : compacto(t)}</span>
          </div>
        ))}
        <div className="viz-cols" onMouseLeave={() => setFoco(null)}>
          {dias.map((d, i) => (
            <button
              key={d.dia}
              type="button"
              className={`viz-col ${foco === i ? "ativo" : ""} ${d.dia === hoje ? "hoje" : ""}`}
              aria-label={`${d.rotulo}: ${brl(d.total)}, ${d.qtd} ${d.qtd === 1 ? "cota" : "cotas"}`}
              onMouseEnter={() => setFoco(i)}
              onFocus={() => setFoco(i)}
              onBlur={() => setFoco(null)}
            >
              {d.total > 0 && <span className="viz-bar" style={{ height: `${(d.total / topo) * 100}%` }} />}
              {melhor?.dia === d.dia && foco === null && (
                <span className="viz-label" style={{ bottom: `calc(${(d.total / topo) * 100}% + 4px)` }}>{compacto(d.total)}</span>
              )}
            </button>
          ))}
        </div>
        {atual && (
          <div className="viz-tip" role="status" style={{
            left: `clamp(70px, ${((foco! + 0.5) / dias.length) * 100}%, calc(100% - 70px))`,
            bottom: `calc(${(atual.total / topo) * 100}% + 10px)`,
          }}>
            <strong>{brl(atual.total)}</strong>
            <span>{atual.rotulo} · {atual.qtd} {atual.qtd === 1 ? "cota" : "cotas"}</span>
          </div>
        )}
      </div>
      <div className="viz-x">
        {dias.map((d) => <span key={d.dia}>{marcados.has(d.dia) ? d.dia : ""}</span>)}
      </div>
      <details className="viz-tabela">
        <summary>Ver como tabela</summary>
        <table>
          <thead><tr><th>Dia</th><th>Cotas</th><th style={{ textAlign: "right" }}>Volume</th></tr></thead>
          <tbody>
            {dias.filter((d) => d.qtd > 0).map((d) => (
              <tr key={d.dia}><td>{d.rotulo}</td><td>{d.qtd}</td><td style={{ textAlign: "right" }}>{brl(d.total)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
