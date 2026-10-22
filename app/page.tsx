import { redirect } from "next/navigation";
import { db, STATUSES } from "@/lib/supabase";
import { exigirPerfil } from "@/lib/auth";
import { intervaloMes, mesAnterior, mesAtualBR, nomeMes, hojeBR, diaBR, vendasEntre, validas, soma, ranking } from "@/lib/painel";
import DashboardView from "./DashboardView";
import type { Dia } from "./VendasPorDia";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: { mes?: string } }) {
  const perfil = await exigirPerfil();
  if (perfil.papel !== "admin") redirect("/kanban"); // vendedor só usa o kanban

  const mes = /^\d{4}-\d{2}$/.test(searchParams.mes ?? "") ? searchParams.mes! : mesAtualBR();
  const mesAnt = mesAnterior(mes);
  const atual = intervaloMes(mes);
  const ant = intervaloMes(mesAnt);

  const supa = db();
  // leads contam no mês em que foram criados de verdade (created_time da planilha), não no dia da importação
  const contarLeads = (i: { inicio: Date; fim: Date }, status?: string) => {
    const q = supa.from("leads").select("id", { count: "exact", head: true })
      .gte("criado_em", i.inicio.toISOString()).lt("criado_em", i.fim.toISOString());
    if (status) q.eq("status", status);
    return q.then((r) => r.count ?? 0);
  };

  const [vendasMes, vendasAnt, leadsMes, leadsAnt, ...porEtapa] = await Promise.all([
    vendasEntre(atual.inicio, atual.fim),
    vendasEntre(ant.inicio, ant.fim),
    contarLeads(atual),
    contarLeads(ant),
    ...STATUSES.map((s) => contarLeads(atual, s.id)),
  ]);

  const ok = validas(vendasMes);
  const okAnt = validas(vendasAnt);
  const volume = soma(ok), volumeAnt = soma(okAnt);
  const ehMesAtual = mes === mesAtualBR();
  const vendasHoje = ehMesAtual ? ok.filter((v) => diaBR(v.created_at) === hojeBR()) : [];

  // série diária do mês (dias sem venda entram zerados)
  const [y, m] = mes.split("-").map(Number);
  const mesCurto = nomeMes(mes, true).toLowerCase();
  const dias: Dia[] = Array.from({ length: new Date(Date.UTC(y, m, 0)).getUTCDate() },
    (_, i) => ({ dia: i + 1, rotulo: `${i + 1} ${mesCurto}`, total: 0, qtd: 0 }));
  for (const v of ok) {
    const d = dias[Number(diaBR(v.created_at).slice(8, 10)) - 1];
    if (d) { d.total += Number(v.valor); d.qtd += 1; }
  }

  return (
    <DashboardView
      mes={mes} mesAnt={mesAnt} ehMesAtual={ehMesAtual}
      volume={volume} volumeAnt={volumeAnt}
      concluido={soma(ok.filter((v) => v.pagamento === "concluido"))}
      concluidoAnt={soma(okAnt.filter((v) => v.pagamento === "concluido"))}
      cotas={ok.length} cotasAnt={okAnt.length}
      ticket={ok.length ? volume / ok.length : 0} ticketAnt={okAnt.length ? volumeAnt / okAnt.length : 0}
      conversao={leadsMes ? (ok.length / leadsMes) * 100 : 0} conversaoAnt={leadsAnt ? (okAnt.length / leadsAnt) * 100 : 0}
      hojeTotal={soma(vendasHoje)} hojeQtd={vendasHoje.length}
      dias={dias} hoje={ehMesAtual ? Number(hojeBR().slice(8, 10)) : null}
      placar={await ranking(vendasMes)}
      etapas={STATUSES.map((s, i) => ({ id: s.id, label: s.label, qtd: porEtapa[i] }))} leadsMes={leadsMes}
      vendas={vendasMes}
    />
  );
}
