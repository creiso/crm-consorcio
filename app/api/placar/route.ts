import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { perfilApi } from "@/lib/auth";
import {
  intervaloHoje, intervaloMes, mesAtualBR, nomeMes, hojeBR, diaBR,
  vendasEntre, validas, soma, ranking, rankingEquipes, listarEquipes,
} from "@/lib/painel";

export const dynamic = "force-dynamic";

// Dados do placar da TV: ranking dos vendedores (mês ou hoje), placar das equipes e as últimas vendas.
// Admin vê tudo ou escolhe uma equipe (?equipe=); coordenador vê os vendedores da equipe dele.
// O placar das equipes sempre compara todas as equipes.
export async function GET(req: Request) {
  const p = await perfilApi("lider");
  if (p instanceof NextResponse) return p;
  const params = new URL(req.url).searchParams;
  const periodo = params.get("periodo") === "hoje" ? "hoje" : "mes";
  const mes = mesAtualBR();
  const intervalo = periodo === "hoje" ? intervaloHoje() : intervaloMes(mes);

  try {
    const equipes = await listarEquipes();
    const equipeId = p.papel === "coordenador"
      ? p.equipe_id
      : equipes.some((e) => e.id === params.get("equipe")) ? params.get("equipe") : null;
    if (p.papel === "coordenador" && !equipeId)
      return NextResponse.json({ error: "Você ainda não está em uma equipe" }, { status: 400 });

    const ultimasQ = db().from("vendas")
      .select("id, valor, tipo, created_at, leads(nome), vendedores(nome, foto_url), equipes(nome)")
      .neq("pagamento", "cancelado").order("created_at", { ascending: false }).limit(8);
    if (equipeId) ultimasQ.eq("equipe_id", equipeId);

    const [vendas, todas, ultimas] = await Promise.all([
      vendasEntre(intervalo.inicio, intervalo.fim, equipeId),
      equipeId ? vendasEntre(intervalo.inicio, intervalo.fim) : Promise.resolve(null),
      ultimasQ,
    ]);
    const ok = validas(vendas);
    const hoje = ok.filter((v) => diaBR(v.created_at) === hojeBR());
    const [rank, rankEquipes] = await Promise.all([ranking(vendas, equipeId), rankingEquipes(todas ?? vendas)]);

    return NextResponse.json({
      periodo,
      titulo: periodo === "hoje"
        ? new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" })
          .replace(/^./, (c) => c.toUpperCase())
        : nomeMes(mes),
      equipe: equipes.find((e) => e.id === equipeId) ?? null,
      // só o admin troca a equipe da TV
      equipes: p.papel === "admin" ? equipes : [],
      total: soma(ok),
      qtd: ok.length,
      hojeTotal: soma(hoje),
      hojeQtd: hoje.length,
      ranking: rank,
      equipesRanking: rankEquipes,
      // na TV aparece só o primeiro nome do cliente
      ultimas: ((ultimas.data ?? []) as unknown as {
        id: string; valor: number; tipo: string; created_at: string; leads: { nome: string } | null;
        vendedores: { nome: string; foto_url: string | null } | null; equipes: { nome: string } | null;
      }[]).map((v) => ({
        id: v.id, valor: Number(v.valor), tipo: v.tipo, created_at: v.created_at,
        cliente: (v.leads?.nome ?? "").split(" ")[0] || "—",
        vendedor: v.vendedores?.nome ?? "—", foto_url: v.vendedores?.foto_url ?? null, equipe: v.equipes?.nome ?? null,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
