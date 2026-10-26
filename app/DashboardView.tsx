import Link from "next/link";
import { brl } from "@/lib/supabase";
import { nomeMes, brlCompacto, TZ, type LinhaRanking, type LinhaEquipe, type Equipe, type VendaPainel, type TemposAtendimento } from "@/lib/painel";
import PagamentoTag from "./PagamentoTag";
import Avatar from "./Avatar";
import VendasPorDia, { type Dia } from "./VendasPorDia";
import { siglaEquipe } from "@/lib/sigla";

export type DashProps = {
  mes: string; mesAnt: string; ehMesAtual: boolean;
  volume: number; volumeAnt: number; concluido: number; concluidoAnt: number;
  cotas: number; cotasAnt: number; ticket: number; ticketAnt: number; conversao: number; conversaoAnt: number;
  hojeTotal: number; hojeQtd: number;
  dias: Dia[]; hoje: number | null;
  placar: LinhaRanking[];
  placarEquipes: LinhaEquipe[];
  etapas: { id: string; label: string; qtd: number }[]; leadsMes: number;
  vendas: VendaPainel[];
  tempos: TemposAtendimento | null; // null = SQL 008 ainda não rodou
  // escopo: equipe filtrada (admin) ou a equipe do coordenador; listaEquipes só vem para quem pode filtrar
  equipeAtual: Equipe | null;
  listaEquipes: Equipe[] | null;
};

const ICONE: Record<string, string> = { imovel: "🏠", automovel: "🚗", servicos: "🛠️" };
const MEDALHA = ["🥇", "🥈", "🥉"];
const pct = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const cotasTxt = (n: number) => `${n} ${n === 1 ? "cota" : "cotas"}`;

// Horas de expediente: 7 → "7 min", 135 → "2 h 15 min", 1700 → "28 h" (sem dias, que confundiriam com dias corridos)
function duracao(min: number) {
  if (min < 1) return "< 1 min";
  const t = Math.round(min), h = Math.floor(t / 60), m = t % 60;
  if (h === 0) return `${m} min`;
  return h < 10 && m ? `${h} h ${m} min` : `${h} h`;
}

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
  const liderEquipes = d.placarEquipes[0]?.total || 1;
  const comEquipes = d.placarEquipes.length > 0;
  const maxTempo = Math.max(1, ...(d.tempos?.linhas ?? []).map((l) => l.mediana ?? 0));
  const placarHref = d.equipeAtual && d.listaEquipes ? `/placar?equipe=${d.equipeAtual.id}` : "/placar";

  const cardVendas = (
    <div className="card span3">
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
                <PagamentoTag id={v.id} value={v.pagamento} editavel={!!d.listaEquipes} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="dash-topo">
        <div>
          <h1>Dashboard</h1>
          <p>
            {nomeMes(d.mes)}{d.ehMesAtual ? " · parcial do mês" : ""}
            {d.equipeAtual && <> · <span className="pill-equipe">{d.equipeAtual.nome}</span></>}
          </p>
        </div>
        <form className="filtros">
          <input type="month" name="mes" defaultValue={d.mes} aria-label="Mês" />
          {d.listaEquipes && d.listaEquipes.length > 0 && (
            <select name="equipe" defaultValue={d.equipeAtual?.id ?? ""} aria-label="Equipe" className="filtro-equipe">
              <option value="">Todas as equipes</option>
              {d.listaEquipes.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          )}
          <button className="btn secondary">Filtrar</button>
          {!d.ehMesAtual && <Link className="btn secondary" href="/">Mês atual</Link>}
          <Link className="btn" href={placarHref} aria-label="Abrir placar">📺<span className="so-desk">Abrir placar</span></Link>
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
            <h3>Ranking de consultores</h3>
            <Link href={placarHref}>Ver placar →</Link>
          </div>
          {d.placar.length === 0 && <div className="vazio">Cadastre consultores em Usuários.</div>}
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
          {d.placar.length > 8 && <div className="card-tit" style={{ margin: "8px 0 0" }}><span>+{d.placar.length - 8} consultores no placar</span></div>}
        </div>
      </div>

      <div className="dash-grid">
        {comEquipes && (
          <div className="card">
            <div className="card-tit">
              <h3>Placar das equipes</h3>
              <span>volume do mês</span>
            </div>
            {d.placarEquipes.map((e, i) => (
              <div key={e.id} className={`rank-linha ${d.equipeAtual?.id === e.id ? "destaque" : ""}`}
                title={`${e.nome}: ${brl(e.total)} em ${cotasTxt(e.qtd)}`}>
                <span className="rank-pos">{e.total > 0 && i < 3 ? MEDALHA[i] : `${i + 1}º`}</span>
                <span className="equipe-badge">{siglaEquipe(e.nome)}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="rank-nome">{e.nome}<small>{cotasTxt(e.qtd)} · {e.membros} {e.membros === 1 ? "consultor" : "consultores"}</small></div>
                  <div className="rank-trilho">{e.total > 0 && <div className="rank-barra" style={{ width: `${(e.total / liderEquipes) * 100}%` }} />}</div>
                </div>
                <span className="rank-valor">{brl(e.total)}</span>
              </div>
            ))}
          </div>
        )}

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

        <div className={`card ${comEquipes ? "" : "span2"}`}>
          <div className="card-tit">
            <h3>Tempo até o 1º atendimento</h3>
            <span>{d.tempos?.medianaGeral != null ? `mediana geral ${duracao(d.tempos.medianaGeral)}` : "de Lead para atendimento"}</span>
          </div>
          {!d.tempos ? <div className="vazio">Rode o SQL 008_tempo_atendimento.sql no Supabase para começar a medir.</div>
            : d.tempos.linhas.length === 0 ? <div className="vazio">Nenhum consultor {d.equipeAtual ? "nesta equipe" : "cadastrado"} ainda.</div>
            : d.tempos.linhas.slice(0, 8).map((l, i) => (
              <div key={l.id} className="rank-linha"
                title={`${l.nome}: ${l.mediana != null ? duracao(l.mediana) : "sem atendimentos"} (mediana de ${l.qtd} leads)`}>
                <span className="rank-pos">{l.mediana != null ? `${i + 1}º` : "—"}</span>
                <Avatar nome={l.nome} foto={l.foto_url} tamanho={36} />
                <div style={{ minWidth: 0 }}>
                  <div className="rank-nome">{l.nome}<small>{l.qtd} {l.qtd === 1 ? "atendido" : "atendidos"}</small></div>
                  <div className="rank-trilho">{l.mediana != null && <div className="rank-barra" style={{ width: `${Math.max(2, (l.mediana / maxTempo) * 100)}%` }} />}</div>
                  {d.ehMesAtual && l.fila > 0 && (
                    <div className={`fila ${(l.esperaMaisAntiga ?? 0) > 60 ? "atrasada" : ""}`}>
                      ⏳ {l.fila} na fila{l.esperaMaisAntiga != null ? ` · mais antigo há ${duracao(l.esperaMaisAntiga)}` : ""}
                    </div>
                  )}
                </div>
                <span className="rank-valor">{l.mediana != null ? duracao(l.mediana) : "—"}</span>
              </div>
            ))}
          {d.tempos && (
            <small className="nota">
              Mediana do tempo entre o lead chegar no consultor e sair da coluna Lead, contando só o horário
              comercial: seg a sex 8h30–18h30 e sáb 8h–12h (domingo não conta). Mais rápidos primeiro.
            </small>
          )}
        </div>
      </div>

      <div className="dash-grid">{cardVendas}</div>
    </>
  );
}
