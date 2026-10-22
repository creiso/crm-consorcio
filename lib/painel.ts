import { db } from "./supabase";

// Números do dashboard e do placar, sempre no horário de Brasília.
// Brasília é UTC-3 o ano todo (sem horário de verão desde 2019).
export const TZ = "America/Sao_Paulo";
const OFFSET_H = 3;

export const hojeBR = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ }); // AAAA-MM-DD
export const mesAtualBR = () => hojeBR().slice(0, 7);
export const diaBR = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });

export function intervaloMes(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  return { inicio: new Date(Date.UTC(y, m - 1, 1, OFFSET_H)), fim: new Date(Date.UTC(y, m, 1, OFFSET_H)) };
}

export function intervaloHoje() {
  const [y, m, d] = hojeBR().split("-").map(Number);
  return { inicio: new Date(Date.UTC(y, m - 1, d, OFFSET_H)), fim: new Date(Date.UTC(y, m - 1, d + 1, OFFSET_H)) };
}

export function mesAnterior(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

export function nomeMes(mes: string, curto = false) {
  const [y, m] = mes.split("-").map(Number);
  const s = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("pt-BR", curto ? { month: "short", timeZone: "UTC" } : { month: "long", year: "numeric", timeZone: "UTC" });
  return s.charAt(0).toUpperCase() + s.slice(1).replace(".", "");
}

export type VendaPainel = {
  id: string; valor: number; tipo: string; grupo: string | null; cota: string | null;
  pagamento: "aguardando" | "concluido" | "cancelado"; created_at: string; vendedor_id: string; equipe_id: string | null;
  leads: { nome: string } | null; vendedores: { nome: string; foto_url: string | null } | null;
};

// equipeId limita às vendas de uma equipe (coordenador, ou admin filtrando)
export async function vendasEntre(inicio: Date, fim: Date, equipeId?: string | null) {
  const q = db().from("vendas")
    .select("id, valor, tipo, grupo, cota, pagamento, created_at, vendedor_id, equipe_id, leads(nome), vendedores(nome, foto_url)")
    .gte("created_at", inicio.toISOString()).lt("created_at", fim.toISOString())
    .order("created_at", { ascending: false });
  if (equipeId) q.eq("equipe_id", equipeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as VendaPainel[];
}

export type Equipe = { id: string; nome: string };
export async function listarEquipes(): Promise<Equipe[]> {
  const { data } = await db().from("equipes").select("id, nome").order("nome");
  return data ?? [];
}

export const validas = (vendas: VendaPainel[]) => vendas.filter((v) => v.pagamento !== "cancelado");
export const soma = (vendas: VendaPainel[]) => vendas.reduce((s, v) => s + Number(v.valor), 0);

export type LinhaRanking = { id: string; nome: string; foto_url: string | null; total: number; qtd: number };

// Ranking por volume vendido (canceladas não contam). Vendedores ativos sem venda entram zerados.
// Com equipeId, só os vendedores daquela equipe.
export async function ranking(vendas: VendaPainel[], equipeId?: string | null): Promise<LinhaRanking[]> {
  const q = db().from("vendedores").select("id, nome, foto_url").eq("ativo", true).eq("papel", "vendedor");
  if (equipeId) q.eq("equipe_id", equipeId);
  const { data: equipe } = await q;
  const mapa = new Map<string, LinhaRanking>();
  for (const v of equipe ?? []) mapa.set(v.id, { ...v, total: 0, qtd: 0 });
  for (const v of validas(vendas)) {
    const linha = mapa.get(v.vendedor_id) ??
      { id: v.vendedor_id, nome: v.vendedores?.nome ?? "—", foto_url: v.vendedores?.foto_url ?? null, total: 0, qtd: 0 };
    linha.total += Number(v.valor);
    linha.qtd += 1;
    mapa.set(v.vendedor_id, linha);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total || b.qtd - a.qtd || a.nome.localeCompare(b.nome));
}

export type LinhaEquipe = { id: string; nome: string; total: number; qtd: number; membros: number };

// Placar das equipes: soma das vendas pela equipe gravada na venda. Equipes sem venda entram zeradas.
export async function rankingEquipes(vendas: VendaPainel[]): Promise<LinhaEquipe[]> {
  const [equipes, { data: membros }] = await Promise.all([
    listarEquipes(),
    db().from("vendedores").select("equipe_id").eq("ativo", true).eq("papel", "vendedor").not("equipe_id", "is", null),
  ]);
  const mapa = new Map<string, LinhaEquipe>();
  for (const e of equipes) mapa.set(e.id, { ...e, total: 0, qtd: 0, membros: 0 });
  for (const m of membros ?? []) { const e = mapa.get(m.equipe_id); if (e) e.membros += 1; }
  for (const v of validas(vendas)) {
    const e = v.equipe_id ? mapa.get(v.equipe_id) : undefined;
    if (!e) continue;
    e.total += Number(v.valor);
    e.qtd += 1;
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total || b.qtd - a.qtd || a.nome.localeCompare(b.nome));
}

// Valores compactos para eixos e telas grandes: R$ 250 mil, R$ 1,2 mi.
export const brlCompacto = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(v);
