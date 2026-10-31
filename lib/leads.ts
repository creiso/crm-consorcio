import { db } from "./supabase";
import { leadIdMeta } from "./meta";

type Row = Record<string, unknown>;

// Cabeçalhos são comparados normalizados: sem acento, minúsculos, pontuação vira espaço.
// "você_sabe_como_funciona_o_consórcio?" → "voce sabe como funciona o consorcio"
export const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Padrão das planilhas (formulário de lead do Facebook/Instagram) + variações comuns.
// A ordem dos apelidos é a prioridade quando a planilha tem mais de uma coluna parecida.
const ALIASES: Record<string, string[]> = {
  id: ["id", "lead id", "codigo"],
  criado_em: ["created time", "data de criacao", "criado em", "data do lead", "data"],
  nome: ["nome completo", "nome", "full name", "name", "cliente"],
  telefone: ["telefone", "phone number", "celular", "whatsapp", "phone", "fone"],
  email: ["email", "e mail", "mail"],
  cidade: ["cidade", "city"],
  renda: ["qual sua renda mensal", "qual a sua renda mensal", "renda mensal", "renda", "salario", "faixa de renda"],
  valor_consorcio: ["valor do consorcio", "qual o valor do consorcio", "valor da carta de credito", "valor da carta",
    "valor do credito", "valor pretendido", "valor", "credito"],
  conhece_consorcio: ["voce sabe como funciona o consorcio", "sabe como funciona o consorcio", "voce conhece o consorcio",
    "conhece o consorcio", "ja conhece o consorcio", "conhece consorcio"],
  plataforma: ["platform", "plataforma"],
  campanha: ["campaign name", "campanha"],
  conjunto: ["adset name", "conjunto de anuncios", "conjunto"],
  anuncio: ["ad name", "anuncio"],
  formulario: ["form name", "formulario"],
  interesse: ["interesse", "produto", "tipo"],
  observacoes: ["observacoes", "obs"],
  vendedor: ["vendedor", "responsavel", "consultor"],
};

// O texto das perguntas muda entre formulários; se o nome exato não bater, procura pelo sentido.
const PARECIDO: Record<string, (h: string) => boolean> = {
  renda: (h) => /\b(renda|salario)\b/.test(h),
  valor_consorcio: (h) => /\bvalor\b/.test(h) && !/\b(renda|salario)\b/.test(h),
  conhece_consorcio: (h) => /\bconsorcio\b/.test(h) && /\b(conhece|sabe|funciona)\b/.test(h),
};

const vazio = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

// Lê os campos de uma linha e anota quais colunas foram usadas (o resto vai para dados_extras).
function leitor(row: Row) {
  const usados = new Set<string>();
  const cabecalhos = Object.keys(row).map((k) => [k, norm(k)] as const);
  function pick(campo: string): unknown {
    for (const apelido of ALIASES[campo]) {
      const achado = cabecalhos.find(([, n]) => n === apelido);
      if (!achado) continue;
      usados.add(achado[0]);
      if (!vazio(row[achado[0]])) return row[achado[0]];
    }
    const parecido = PARECIDO[campo];
    if (parecido) {
      for (const [k, n] of cabecalhos) {
        if (usados.has(k) || !parecido(n)) continue;
        usados.add(k);
        if (!vazio(row[k])) return row[k];
      }
    }
    return undefined;
  }
  const txt = (campo: string) => { const v = pick(campo); return v === undefined ? null : String(v).trim(); };
  return { pick, txt, usados };
}

// Valor do consórcio só vira número quando é um valor único ("R$ 100.000,00", "100000", "150 mil", "1,5 milhão").
// Faixas como "de 100 mil a 200 mil" ficam só como texto em valor_consorcio.
export function parseValor(v: string | null) {
  if (!v) return null;
  let s = v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/r\$|\s/g, "");
  let mult = 1;
  if (/(milhoes|milhao|mi)$/.test(s)) { mult = 1e6; s = s.replace(/(milhoes|milhao|mi)$/, ""); }
  else if (/mil$/.test(s)) { mult = 1e3; s = s.replace(/mil$/, ""); }
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+(,\d{1,2})?$/.test(s)) s = s.replace(",", ".");
  else if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s) * mult;
  return Number.isFinite(n) && n > 0 ? n : null;
}

// created_time chega de vários jeitos: ISO do Facebook ("2026-10-20T14:33:12-03:00" ou "+0000"),
// data brasileira ("20/10/2026 14:33") ou número de data do Excel/Sheets. Sem fuso, vale o horário de Brasília.
export function parseData(v: unknown): string | undefined {
  if (vazio(v)) return undefined;
  let d: Date;
  if (typeof v === "number") {
    d = new Date(Math.round((v - 25569) * 86400000) + 3 * 3600000);
  } else {
    const s = String(v).trim();
    const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (br) {
      let [dia, mes] = [+br[1], +br[2]];
      if (mes > 12 && dia <= 12) [dia, mes] = [mes, dia]; // veio no formato americano
      d = new Date(Date.UTC(+br[3], mes - 1, dia, +(br[4] ?? 0) + 3, +(br[5] ?? 0), +(br[6] ?? 0)));
    } else if (iso) {
      d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3], +(iso[4] ?? 0) + 3, +(iso[5] ?? 0), +(iso[6] ?? 0)));
    } else {
      d = new Date(s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
    }
  }
  if (isNaN(d.getTime())) return undefined;
  const ano = d.getUTCFullYear();
  return ano >= 2000 && ano <= 2100 ? d.toISOString() : undefined;
}

export function lerLinha(row: Row, origem: string) {
  const { pick, txt, usados } = leitor(row);
  const nome = txt("nome");
  const telefone = txt("telefone")?.replace(/\D/g, "") || null;
  const email = txt("email")?.toLowerCase() || null;
  const id = txt("id");
  const external_key = id ? `${origem}:${id}` : telefone ? `tel:${telefone}` : email ? `mail:${email}` : null;
  if (!nome || !external_key) return null;

  const valor_consorcio = txt("valor_consorcio");
  const criado_em = parseData(pick("criado_em"));
  const vendedor = txt("vendedor");

  // status NÃO entra aqui: lead novo cai em "lead", lead existente mantém a etapa do kanban.
  // (o lead_status do Facebook fica guardado em dados_extras)
  const lead = {
    external_key,
    nome,
    telefone,
    email,
    cidade: txt("cidade"),
    renda: txt("renda"),
    valor_consorcio,
    valor_pretendido: parseValor(valor_consorcio),
    conhece_consorcio: txt("conhece_consorcio"),
    plataforma: txt("plataforma")?.toLowerCase() ?? null,
    campanha: txt("campanha"),
    conjunto: txt("conjunto"),
    anuncio: txt("anuncio"),
    formulario: txt("formulario"),
    interesse: txt("interesse"),
    observacoes: txt("observacoes"),
    origem,
    // sem created_time a coluna fica de fora e o banco usa a data de entrada
    ...(criado_em ? { criado_em } : {}),
    dados_extras: Object.fromEntries(Object.entries(row).filter(([k]) => !usados.has(k))),
  };
  return { lead, vendedor };
}

// Distribuição dos leads sem dono (lead que já tem vendedor nunca muda de dono sozinho):
// equipes = para quais equipes a planilha vai (vazio = todas);
// "automatica" = roleta entre os vendedores dessas equipes; "manual" = fica sem vendedor para o admin
// (ou o coordenador, quando a planilha é de uma equipe só) distribuir no kanban.
export type Distribuicao = { modo: "automatica" | "manual"; equipes: string[] };

// Coordenador não entra na roleta: só papel "vendedor", ativo e marcado "na roleta".
async function rodarRoleta(leadIds: string[], equipes: string[]) {
  const supa = db();
  const q = supa.from("vendedores").select("id, equipe_id")
    .eq("papel", "vendedor").eq("ativo", true).eq("na_roleta", true)
    .order("ultimo_lead_em", { ascending: true, nullsFirst: true });
  if (equipes.length) q.in("equipe_id", equipes);
  const { data: fila } = await q;
  if (!fila?.length || !leadIds.length) return;

  const porVendedor = new Map<string, string[]>();
  leadIds.forEach((id, i) => {
    const v = fila[i % fila.length].id;
    porVendedor.set(v, [...(porVendedor.get(v) ?? []), id]);
  });
  // quem recebeu o último lead vai para o fim da fila
  const base = Date.now();
  for (const v of fila) {
    const ids = porVendedor.get(v.id);
    if (!ids) continue;
    for (let j = 0; j < ids.length; j += 200)
      await supa.from("leads").update({ vendedor_id: v.id, equipe_id: v.equipe_id }).in("id", ids.slice(j, j + 200)).is("vendedor_id", null);
    const ultimaPosicao = leadIds.lastIndexOf(ids[ids.length - 1]);
    await supa.from("vendedores").update({ ultimo_lead_em: new Date(base + ultimaPosicao).toISOString() }).eq("id", v.id);
  }
}

// Variações do mesmo celular: com e sem o 55 do Brasil
function variacoesTelefone(tel: string) {
  const v = new Set([tel]);
  if (tel.startsWith("55") && tel.length >= 12) v.add(tel.slice(2));
  if (tel.length === 10 || tel.length === 11) v.add("55" + tel);
  return [...v];
}

type Chaveavel = { external_key: string; telefone: string | null; email: string | null };

// Evita lead duplicado. Um lead que ainda não existe pela chave, mas já existe com o mesmo id da Meta,
// telefone ou e-mail, atualiza o que já existe em vez de criar outro. Cobre: o mesmo lead em duas
// planilhas, planilha removida e cadastrada de novo, arquivo importado + planilha, e a pessoa que
// preencheu o formulário de novo (vale o lead que já estava sendo atendido).
export async function juntarComExistentes<T extends Chaveavel>(leads: T[]): Promise<T[]> {
  const supa = db();
  const lotes = <X,>(lista: X[], n: number) => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n));

  const jaExistem = new Set<string>();
  for (const lote of lotes(leads.map((l) => l.external_key), 200)) {
    const { data } = await supa.from("leads").select("external_key").in("external_key", lote);
    for (const d of data ?? []) jaExistem.add(d.external_key);
  }
  const novos = leads.filter((l) => !jaExistem.has(l.external_key));
  if (!novos.length) return leads;

  // leads que já estão no banco com o mesmo id da Meta, telefone ou e-mail (o mais antigo vence)
  type Existente = { external_key: string; telefone: string | null; email: string | null; created_at: string };
  const achados: Existente[] = [];
  const buscar = async (filtro: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    const { data } = await filtro(base());
    achados.push(...((data ?? []) as Existente[]));
  };
  const base = () => supa.from("leads").select("external_key, telefone, email, created_at");
  const idsMeta = [...new Set(novos.map((l) => leadIdMeta(l.external_key)).filter((x): x is string => !!x))];
  const telefones = [...new Set(novos.flatMap((l) => (l.telefone ? variacoesTelefone(l.telefone) : [])))];
  const emails = [...new Set(novos.map((l) => l.email).filter((x): x is string => !!x))];
  for (const lote of lotes(idsMeta, 30)) await buscar((q) => q.or(lote.map((id) => `external_key.like.*l:${id}`).join(",")));
  for (const lote of lotes(telefones, 200)) await buscar((q) => q.in("telefone", lote));
  for (const lote of lotes(emails, 200)) await buscar((q) => q.in("email", lote));
  achados.sort((a, b) => a.created_at.localeCompare(b.created_at));

  const porMeta = new Map<string, string>(), porTel = new Map<string, string>(), porEmail = new Map<string, string>();
  for (const e of achados) {
    const id = leadIdMeta(e.external_key);
    if (id && !porMeta.has(id)) porMeta.set(id, e.external_key);
    for (const t of e.telefone ? variacoesTelefone(e.telefone) : []) if (!porTel.has(t)) porTel.set(t, e.external_key);
    if (e.email && !porEmail.has(e.email)) porEmail.set(e.email, e.external_key);
  }

  // dentro do próprio lote também: dois envios da mesma pessoa viram um lead só
  for (const l of novos) {
    const id = leadIdMeta(l.external_key);
    const tels = l.telefone ? variacoesTelefone(l.telefone) : [];
    const chave = (id && porMeta.get(id)) || tels.map((t) => porTel.get(t)).find(Boolean) || (l.email && porEmail.get(l.email));
    if (chave) l.external_key = chave;
    if (id && !porMeta.has(id)) porMeta.set(id, l.external_key);
    for (const t of tels) if (!porTel.has(t)) porTel.set(t, l.external_key);
    if (l.email && !porEmail.has(l.email)) porEmail.set(l.email, l.external_key);
  }
  return leads;
}

export async function upsertLeads(rows: Row[], origem: string, distribuicao: Distribuicao) {
  const supa = db();
  const { data: vendedores } = await supa.from("vendedores").select("id, nome, email, equipe_id");
  const acharVendedor = (v: string | null) => {
    if (!v) return undefined;
    const n = norm(v);
    return vendedores?.find((x) => norm(x.nome) === n || (x.email && norm(x.email) === n));
  };

  const leads = rows
    .map((r) => {
      const linha = lerLinha(r, origem);
      if (!linha) return null;
      // coluna "vendedor" na planilha: o lead já chega com dono (e com a equipe dele)
      const v = acharVendedor(linha.vendedor);
      return v ? { ...linha.lead, vendedor_id: v.id, equipe_id: v.equipe_id } : linha.lead;
    })
    .filter((l): l is NonNullable<typeof l> => !!l);
  // junta com o que já existe (mesmo id da Meta, telefone ou e-mail) e tira repetidos do lote (última linha vence)
  await juntarComExistentes(leads);
  const unique = [...new Map(leads.map((l) => [l.external_key, l])).values()];
  if (!unique.length) return { recebidos: rows.length, gravados: 0, ignorados: rows.length };

  // Upsert em lotes com as mesmas colunas: coluna ausente não apaga o que já está no banco
  // (planilha sem "vendedor" não tira o dono do lead; sem created_time mantém a data que já existe).
  const lotes = new Map<string, typeof unique>();
  for (const l of unique) {
    const chave = Object.keys(l).sort().join(",");
    lotes.set(chave, [...(lotes.get(chave) ?? []), l]);
  }
  for (const lote of lotes.values()) {
    const { error } = await supa.from("leads").upsert(lote, { onConflict: "external_key" });
    if (error) throw new Error(error.message);
  }

  const semVendedor = unique.filter((l) => !("vendedor_id" in l));
  if (semVendedor.length) {
    // só os que continuam sem dono depois do upsert (novos ou nunca atribuídos)
    const orfaos: string[] = [];
    for (let i = 0; i < semVendedor.length; i += 200) {
      const { data } = await supa.from("leads").select("id")
        .in("external_key", semVendedor.slice(i, i + 200).map((l) => l.external_key)).is("vendedor_id", null)
        .order("criado_em");
      orfaos.push(...(data ?? []).map((d) => d.id));
    }
    // planilha de uma equipe só: o lead sem dono já fica na equipe (o coordenador enxerga e distribui)
    const unicaEquipe = distribuicao.equipes.length === 1 ? distribuicao.equipes[0] : null;
    if (unicaEquipe)
      for (let i = 0; i < orfaos.length; i += 200)
        await supa.from("leads").update({ equipe_id: unicaEquipe }).in("id", orfaos.slice(i, i + 200)).is("vendedor_id", null);
    if (distribuicao.modo === "automatica") await rodarRoleta(orfaos, distribuicao.equipes);
  }
  return { recebidos: rows.length, gravados: unique.length, ignorados: rows.length - leads.length };
}
