import Link from "next/link";
import { brl } from "@/lib/supabase";
import { nomeMes, brlCompacto, TZ, type LinhaRanking, type VendaPainel } from "@/lib/painel";
import PagamentoTag from "./PagamentoTag";
import Avatar from "./Avatar";
import VendasPorDia, { type Dia } from "./VendasPorDia";

export type DashProps = {
  mes: string; mesAnt: string; ehMesAtual: boolean;
  volume: number; volumeAnt: number; concluido: number; concluidoAnt: number;
  cotas: number; cotasAnt: number; ticket: number; ticketAnt: number; conversao: number; conversaoAnt: number;
  hojeTotal: number; hojeQtd: number;
  dias: Dia[]; hoje: number | null;
  placar: LinhaRanking[];
  etapas: { id: string; label: string; qtd: number }[]; leadsMes: number;
  vendas: VendaPainel[];
};

const ICONE: Record<string, string> = { imovel: "🏠", automovel: "🚗", servicos: "🛠️" };
const MEDALHA = ["🥇", "🥈", "🥉"];
const pct = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const cotasTxt = (n: number) => `${n} ${n === 1 ? "cota" : "cotas"}`;

// Valor completo no computador; compacto (R$ 450 mil) no celular, onde o card é estreito.
const Dinheiro = ({ v }: { v: number }) => (
  <span title={brl(v)}><span className="v-longo">{brl(v)}</span><span className="v-curto">{brlCompacto(v)}</span></span>
);

// Variação contra o mês anterior: seta + texto, nunca só cor.
function Delta({ atual, anterior, mesAnt, pontos }: { atual: number; anterior: number; mesAnt: string; pontos?: boolean }) {
  const vs = <em>vs {nomeMes(mesAnt, true).toLowerCase()}</em>;
  if (pontos) {
    const d = atual - anterior;
    if (Math.abs(d) < 0.05) return <span className="delta neutro">= igual {vs}</span>;
    return <span className={`delta ${d > 0 ? "bom" : "ruim"}`}>{d > 0 ? "▲" : "▼"} {pct(Math.abs(d))} p.p. {vs}</span>;
  }
  if (!anterior) return <span className="delta neutro">{atual > 0 ? `sem dados de ${nomeMes(mesAnt, true).toLowerCase()}` : "—"}</span>;
  const p = ((atual - anterior) / anterior) * 100;
  if (Math.abs(p) < 0.05) return <span className="delta neutro">= igual {vs}</span>;
  return <span className={`delta ${p > 0 ? "bom" : "ruim"}`}>{p > 0 ? "▲" : "▼"} {pct(Math.abs(p))}% {vs}</span>;
}

export default function DashboardView(d: DashProps) {
  const lider = d.placar[0]?.total || 1;
  const maxEtapa = Math.max(1, ...d.etapas.map((e) => e.qtd));
  const mesNome = nomeMes(d.mes).split(" de ")[0].toLowerCase(); // "outubro"

  return (
    <>
      <div className="dash-topo">
        <div>
          <h1>Dashboard</h1>
          <p>{nomeMes(d.mes)}{d.ehMesAtual ? " · parcial do mês" : ""}</p>
        </div>
        <form className="filtros">
          <input type="month" name="mes" defaultValue={d.mes} aria-label="Mês" />
          <button className="btn secondary">Filtrar</button>
          {!d.ehMesAtual && <Link className="btn secondary" href="/">Mês atual</Link>}
          <Link className="btn" href="/placar" aria-label="Abrir placar">📺<span className="so-desk">Abrir placar</span></Link>
        </form>
      </div>

      <div className="dash-grid">
        <div className="card hero">
          <span className="rotulo">Volume vendido em {mesNome}</span>
          <div className="valor">{brl(d.volume)}</div>
          <Delta atual={d.volume} anterior={d.volumeAnt} mesAnt={d.mesAnt} />
          {d.ehMesAtual && (
            <div className="hoje">Hoje: <b>{brl(d.hojeTotal)}</b> em {cotasTxt(d.hojeQtd)}</div>
          )}
        </div>
        <div className="tiles span2">
          <div className="card tile">
            <span className="rotulo">Pagamento concluído</span>
            <div className="valor"><Dinheiro v={d.concluido} /></div>
            <Delta atual={d.concluido} anterior={d.concluidoAnt} mesAnt={d.mesAnt} />
          </div>
          <div className="card tile">
            <span className="rotulo">Cotas vendidas</span>
            <div className="valor">{d.cotas}</div>
            <Delta atual={d.cotas} anterior={d.cotasAnt} mesAnt={d.mesAnt} />
          </div>
          <div className="card tile">
            <span className="rotulo">Ticket médio</span>
            <div className="valor"><Dinheiro v={d.ticket} /></div>
            <Delta atual={d.ticket} anterior={d.ticketAnt} mesAnt={d.mesAnt} />
          </div>
          <div className="card tile">
            <span className="rotulo">Conversão de leads</span>
            <div className="valor">{pct(d.conversao)}%</div>
            <Delta atual={d.conversao} anterior={d.conversaoAnt} mesAnt={d.mesAnt} pontos />
          </div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="card span2">
          <div className="card-tit">
            <h3>Volume vendido por dia (R$)</h3>
            <span>{cotasTxt(d.cotas)} · {brl(d.volume)}</span>
          </div>
          <VendasPorDia dias={d.dias} hoje={d.hoje} />
        </div>

        <div className="card">
          <div className="card-tit">
            <h3>Ranking de vendedores</h3>
            <Link href="/placar">Ver placar →</Link>
          </div>
          {d.placar.length === 0 && <div className="vazio">Cadastre vendedores em Usuários.</div>}
          {d.placar.slice(0, 8).map((r, i) => (
            <div key={r.id} className="rank-linha" title={`${r.nome}: ${brl(r.total)} em ${cotasTxt(r.qtd)}`}>
              <span className="rank-pos">{r.total > 0 && i < 3 ? MEDALHA[i] : `${i + 1}º`}</span>
              <Avatar nome={r.nome} foto={r.foto_url} tamanho={36} />
              <div style={{ minWidth: 0 }}>
                <div className="rank-nome">{r.nome}<small>{cotasTxt(r.qtd)}</small></div>
                <div className="rank-trilho">{r.total > 0 && <div className="rank-barra" style={{ width: `${(r.total / lider) * 100}%` }} />}</div>
              </div>
              <span className="rank-valor">{brl(r.total)}</span>
            </div>
          ))}
          {d.placar.length > 8 && <div className="card-tit" style={{ margin: "8px 0 0" }}><span>+{d.placar.length - 8} vendedores no placar</span></div>}
        </div>
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-tit">
            <h3>Leads do mês por etapa</h3>
            <span>{d.leadsMes} recebidos</span>
          </div>
          {d.etapas.map((e) => (
            <div key={e.id} className="etapa-linha">
              <span>{e.label}</span>
              <div className="rank-trilho">{e.qtd > 0 && <div className="rank-barra" style={{ width: `${(e.qtd / maxEtapa) * 100}%` }} />}</div>
              <b>{e.qtd}<small>{d.leadsMes ? `${Math.round((e.qtd / d.leadsMes) * 100)}%` : ""}</small></b>
            </div>
          ))}
        </div>

        <div className="card span2">
          <div className="card-tit">
            <h3>Vendas do mês</h3>
            <span>{d.vendas.length} registradas</span>
          </div>
          {d.vendas.length === 0 ? <div className="vazio">Nenhuma venda no período.</div> : (
            <div className="vendas-lista">
              {d.vendas.map((v) => (
                <div key={v.id} className="sale">
                  <div className="ico">{ICONE[v.tipo] ?? "📄"}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="name">{v.leads?.nome ?? "—"}</div>
                    <div className="meta">
                      <Avatar nome={v.vendedores?.nome} foto={v.vendedores?.foto_url} tamanho={20} />
                      <span>{v.vendedores?.nome ?? "—"}</span>
                      <span>·</span>
                      {(v.grupo || v.cota) && <span>{v.grupo && `Grupo ${v.grupo}`}{v.cota && ` / Cota ${v.cota}`} ·</span>}
                      <span>{new Date(v.created_at).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                  <div className="dir">
                    <span className="val">{brl(Number(v.valor))}</span>
                    <PagamentoTag id={v.id} value={v.pagamento} editavel />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
