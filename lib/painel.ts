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

export type LinhaTempo = {
  id: string; nome: string; foto_url: string | null;
  mediana: number | null; qtd: number;        // minutos até o 1º atendimento, leads atendidos no período
  fila: number; esperaMaisAntiga: number | null; // leads parados em "Lead" agora e há quanto tempo (min)
};
export type TemposAtendimento = { linhas: LinhaTempo[]; medianaGeral: number | null };

// Expediente (horário de Brasília), em minutos do dia, por dia da semana (0 = domingo):
// seg a sex 8h30–18h30, sábado 8h–12h, domingo fechado.
const EXPEDIENTE: ([number, number] | null)[] = [null, [510, 1110], [510, 1110], [510, 1110], [510, 1110], [510, 1110], [480, 720]];
const DIA_MS = 86400000;

// Minutos de expediente entre dois instantes: fora do horário comercial o relógio fica parado.
export function minutosUteis(inicio: Date, fim: Date) {
  const a = inicio.getTime() - OFFSET_H * 3600000, b = fim.getTime() - OFFSET_H * 3600000; // relógio de Brasília
  if (b <= a) return 0;
  let total = 0;
  for (let dia = Math.floor(a / DIA_MS), ultimo = Math.min(Math.floor(b / DIA_MS), dia + 400); dia <= ultimo; dia++) {
    const j = EXPEDIENTE[new Date(dia * DIA_MS).getUTCDay()];
    if (!j) continue;
    total += Math.max(0, Math.min(b, dia * DIA_MS + j[1] * 60000) - Math.max(a, dia * DIA_MS + j[0] * 60000));
  }
  return total / 60000;
}

const mediana = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Tempo entre o lead chegar no consultor (atribuido_em) e sair da coluna Lead pela 1ª vez (atendido_em),
// contando só o horário comercial.
// Mediana, para uma madrugada sem resposta não distorcer a média. null = SQL 008 ainda não rodou.
export async function temposAtendimento(inicio: Date, fim: Date, equipeId: string | null): Promise<TemposAtendimento | null> {
  const supa = db();
  const atendidos = supa.from("leads").select("atribuido_em, atendido_em, atendido_por")
    .gte("atendido_em", inicio.toISOString()).lt("atendido_em", fim.toISOString())
    .not("atribuido_em", "is", null).not("atendido_por", "is", null).limit(10000);
  const fila = supa.from("leads").select("vendedor_id, atribuido_em")
    .eq("status", "lead").not("vendedor_id", "is", null).limit(10000);
  const equipe = supa.from("vendedores").select("id, nome, foto_url").eq("ativo", true).eq("papel", "vendedor");
  if (equipeId) { atendidos.eq("equipe_id", equipeId); fila.eq("equipe_id", equipeId); equipe.eq("equipe_id", equipeId); }
  const [a, f, e] = await Promise.all([atendidos, fila, equipe]);
  if (a.error || f.error) return null;

  const minutos = new Map<string, number[]>();
  for (const l of a.data ?? []) {
    const m = minutosUteis(new Date(l.atribuido_em), new Date(l.atendido_em));
    minutos.set(l.atendido_por, [...(minutos.get(l.atendido_por) ?? []), m]);
  }
  const agora = new Date();
  const naFila = new Map<string, { qtd: number; maisAntigo: number | null }>();
  for (const l of f.data ?? []) {
    const atual = naFila.get(l.vendedor_id) ?? { qtd: 0, maisAntigo: null };
    const espera = l.atribuido_em ? minutosUteis(new Date(l.atribuido_em), agora) : null;
    naFila.set(l.vendedor_id, { qtd: atual.qtd + 1, maisAntigo: espera !== null ? Math.max(atual.maisAntigo ?? 0, espera) : atual.maisAntigo });
  }

  // consultores da equipe + quem atendeu no período mas saiu dela/ficou inativo
  const pessoas = new Map((e.data ?? []).map((p) => [p.id, p]));
  const faltam = [...minutos.keys(), ...naFila.keys()].filter((id) => !pessoas.has(id));
  if (faltam.length) {
    const { data } = await supa.from("vendedores").select("id, nome, foto_url").in("id", [...new Set(faltam)]);
    for (const p of data ?? []) pessoas.set(p.id, p);
  }

  const linhas = [...pessoas.values()].map((p) => ({
    ...p,
    mediana: mediana(minutos.get(p.id) ?? []),
    qtd: minutos.get(p.id)?.length ?? 0,
    fila: naFila.get(p.id)?.qtd ?? 0,
    esperaMaisAntiga: naFila.get(p.id)?.maisAntigo ?? null,
  }));
  // mais rápido primeiro; quem ainda não tem atendimento no período vai para o fim
  linhas.sort((x, y) => (x.mediana ?? Infinity) - (y.mediana ?? Infinity) || y.qtd - x.qtd || x.nome.localeCompare(y.nome));
  return { linhas, medianaGeral: mediana([...minutos.values()].flat()) };
}
