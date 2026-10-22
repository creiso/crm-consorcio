import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { perfilApi } from "@/lib/auth";
import { intervaloHoje, intervaloMes, mesAtualBR, nomeMes, hojeBR, diaBR, vendasEntre, validas, soma, ranking } from "@/lib/painel";

export const dynamic = "force-dynamic";

// Dados do placar da TV: ranking do mês (ou de hoje) + as últimas vendas para a comemoração.
export async function GET(req: Request) {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const periodo = new URL(req.url).searchParams.get("periodo") === "hoje" ? "hoje" : "mes";
  const mes = mesAtualBR();
  const intervalo = periodo === "hoje" ? intervaloHoje() : intervaloMes(mes);

  try {
    const [vendas, ultimas] = await Promise.all([
      vendasEntre(intervalo.inicio, intervalo.fim),
      db().from("vendas")
        .select("id, valor, tipo, created_at, leads(nome), vendedores(nome, foto_url)")
        .neq("pagamento", "cancelado").order("created_at", { ascending: false }).limit(8),
    ]);
    const ok = validas(vendas);
    const hoje = ok.filter((v) => diaBR(v.created_at) === hojeBR());

    return NextResponse.json({
      periodo,
      titulo: periodo === "hoje"
        ? new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" })
          .replace(/^./, (c) => c.toUpperCase())
        : nomeMes(mes),
      total: soma(ok),
      qtd: ok.length,
      hojeTotal: soma(hoje),
      hojeQtd: hoje.length,
      ranking: await ranking(vendas),
      // na TV aparece só o primeiro nome do cliente
      ultimas: ((ultimas.data ?? []) as unknown as {
        id: string; valor: number; tipo: string; created_at: string;
        leads: { nome: string } | null; vendedores: { nome: string; foto_url: string | null } | null;
      }[]).map((v) => ({
        id: v.id, valor: Number(v.valor), tipo: v.tipo, created_at: v.created_at,
        cliente: (v.leads?.nome ?? "").split(" ")[0] || "—",
        vendedor: v.vendedores?.nome ?? "—", foto_url: v.vendedores?.foto_url ?? null,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
