import { db, brl } from "@/lib/supabase";
import PagamentoTag from "./PagamentoTag";
import { exigirPerfil } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Venda = {
  id: string; valor: number; tipo: string; grupo: string | null; cota: string | null;
  pagamento: "aguardando" | "concluido" | "cancelado"; created_at: string;
  leads: { nome: string } | null; vendedores: { nome: string } | null;
};

const ICONE: Record<string, string> = { imovel: "🏠", automovel: "🚗", servicos: "🛠️" };

export default async function Dashboard({ searchParams }: { searchParams: { mes?: string } }) {
  const mes = searchParams.mes ?? new Date().toISOString().slice(0, 7); // AAAA-MM
  const inicio = new Date(`${mes}-01T00:00:00`);
  const fim = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 1);

  const perfil = await exigirPerfil();
  const admin = perfil.papel === "admin";

  const supa = db();
  const vendasQ = supa.from("vendas")
    .select("*, leads(nome), vendedores(nome)")
    .gte("created_at", inicio.toISOString()).lt("created_at", fim.toISOString())
    .order("created_at", { ascending: false });
  const leadsQ = supa.from("leads").select("id", { count: "exact", head: true })
    .gte("created_at", inicio.toISOString()).lt("created_at", fim.toISOString());
  // vendedor só enxerga os próprios números
  if (!admin) { vendasQ.eq("vendedor_id", perfil.id); leadsQ.eq("vendedor_id", perfil.id); }
  const [{ data }, leadsMes] = await Promise.all([vendasQ, leadsQ]);
  const vendas = ((data ?? []) as Venda[]).filter((v) => v.pagamento !== "cancelado");

  const total = vendas.reduce((s, v) => s + Number(v.valor), 0);
  const recebido = vendas.filter((v) => v.pagamento === "concluido").reduce((s, v) => s + Number(v.valor), 0);
  const conversao = leadsMes.count ? (vendas.length / leadsMes.count) * 100 : 0;

  const porVendedor = Object.entries(
    vendas.reduce<Record<string, { total: number; qtd: number }>>((acc, v) => {
      const n = v.vendedores?.nome ?? "—";
      acc[n] = { total: (acc[n]?.total ?? 0) + Number(v.valor), qtd: (acc[n]?.qtd ?? 0) + 1 };
      return acc;
    }, {})
  ).sort((a, b) => b[1].total - a[1].total);
  const max = porVendedor[0]?.[1].total ?? 1;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>{admin ? "Dashboard de vendas" : `Olá, ${perfil.nome}`}</h1>
        <form>
          <input type="month" name="mes" defaultValue={mes} style={{ width: 180 }} />{" "}
          <button className="btn secondary">Filtrar</button>
        </form>
      </div>

      <div className="kpis">
        <div className="card kpi"><div className="l">Volume vendido</div><div className="v">{brl(total)}</div></div>
        <div className="card kpi"><div className="l">Pagamento concluído</div><div className="v">{brl(recebido)}</div></div>
        <div className="card kpi"><div className="l">Cotas vendidas</div><div className="v">{vendas.length}</div></div>
        <div className="card kpi"><div className="l">Ticket médio</div><div className="v">{brl(vendas.length ? total / vendas.length : 0)}</div></div>
        <div className="card kpi"><div className="l">Conversão (leads do mês)</div><div className="v">{conversao.toFixed(1)}%</div></div>
      </div>

      <div className="grid2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Ranking de vendedores</h3>
          {porVendedor.length === 0 && <p style={{ color: "#666" }}>Sem vendas no período.</p>}
          {porVendedor.map(([nome, r]) => (
            <div key={nome} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span>{nome} <small style={{ color: "#666" }}>({r.qtd})</small></span><b>{brl(r.total)}</b>
              </div>
              <div className="bar" style={{ width: `${(r.total / max) * 100}%` }} />
            </div>
          ))}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Vendas recentes</h3>
          {(data as Venda[] | null)?.length ? (data as Venda[]).map((v) => (
            <div key={v.id} className="sale">
              <div className="ico">{ICONE[v.tipo] ?? "📄"}</div>
              <div style={{ flex: 1 }}>
                <div className="name">{v.leads?.nome}</div>
                <div className="meta">
                  {v.grupo && `Grupo ${v.grupo}`}{v.cota && ` / Cota ${v.cota}`} · Vendedor: {v.vendedores?.nome} ·{" "}
                  {new Date(v.created_at).toLocaleDateString("pt-BR")}
                </div>
                <div className="val">{brl(Number(v.valor))}</div>
                <PagamentoTag id={v.id} value={v.pagamento} editavel={admin} />
              </div>
            </div>
          )) : <p style={{ color: "#666" }}>Nenhuma venda no período.</p>}
        </div>
      </div>
    </>
  );
}
