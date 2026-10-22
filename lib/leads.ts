import { db } from "./supabase";

type Row = Record<string, unknown>;

// Aceita variações comuns de cabeçalho das planilhas.
const ALIASES: Record<string, string[]> = {
  // inclui os nomes de coluna dos formulários de lead do Facebook/Instagram
  id: ["id", "codigo", "lead id"],
  nome: ["nome", "name", "cliente", "nome completo", "full name"],
  telefone: ["telefone", "celular", "whatsapp", "phone", "phone number", "fone"],
  email: ["email", "e mail", "mail"],
  cidade: ["cidade", "city"],
  interesse: ["interesse", "produto", "tipo"],
  valor_pretendido: ["valor", "valor pretendido", "credito"],
  observacoes: ["observacoes", "obs"],
  vendedor: ["vendedor", "responsavel", "consultor"],
};

// "Nome_Completo", "nome completo" e "Nome-completo" viram a mesma coisa; acentos são ignorados.
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/[_\-\s]+/g, " ");

function pick(row: Row, field: string): string | undefined {
  for (const key of Object.keys(row)) {
    if (ALIASES[field].includes(norm(key))) {
      const v = row[key];
      if (v !== null && v !== undefined && String(v).trim() !== "") return String(v).trim();
    }
  }
}

function parseValor(v?: string) {
  if (!v) return null;
  const n = Number(v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function toLead(row: Row, origem: string) {
  const nome = pick(row, "nome");
  const telefone = pick(row, "telefone")?.replace(/\D/g, "");
  const email = pick(row, "email")?.toLowerCase();
  const id = pick(row, "id");
  const external_key = id ? `${origem}:${id}` : telefone ? `tel:${telefone}` : email ? `mail:${email}` : null;
  if (!nome || !external_key) return null;

  const known = new Set(Object.values(ALIASES).flat());
  const dados_extras = Object.fromEntries(Object.entries(row).filter(([k]) => !known.has(norm(k))));

  // status NÃO entra aqui: lead novo cai em "lead", lead existente mantém a etapa do kanban.
  return {
    external_key,
    nome,
    telefone: telefone || null,
    email: email || null,
    cidade: pick(row, "cidade") ?? null,
    interesse: pick(row, "interesse") ?? null,
    valor_pretendido: parseValor(pick(row, "valor_pretendido")),
    observacoes: pick(row, "observacoes") ?? null,
    origem,
    dados_extras,
  };
}

// Distribuição dos leads sem dono (leads que já têm vendedor nunca mudam de dono):
// "roleta" = rodízio entre vendedores ativos na roleta; um id = vendedor fixo; null = admin distribui manualmente.
export type Distribuicao = "roleta" | string | null | undefined;

async function rodarRoleta(leadIds: string[]) {
  const supa = db();
  const { data: fila } = await supa.from("vendedores").select("id")
    .eq("papel", "vendedor").eq("ativo", true).eq("na_roleta", true)
    .order("ultimo_lead_em", { ascending: true, nullsFirst: true });
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
      await supa.from("leads").update({ vendedor_id: v.id }).in("id", ids.slice(j, j + 200)).is("vendedor_id", null);
    const ultimaPosicao = leadIds.lastIndexOf(ids[ids.length - 1]);
    await supa.from("vendedores").update({ ultimo_lead_em: new Date(base + ultimaPosicao).toISOString() }).eq("id", v.id);
  }
}

export async function upsertLeads(rows: Row[], origem: string, distribuicao?: Distribuicao) {
  const supa = db();
  const { data: vendedores } = await supa.from("vendedores").select("id, nome, email");
  const acharVendedor = (v?: string) => {
    if (!v) return undefined;
    const n = norm(v);
    return vendedores?.find((x) => norm(x.nome) === n || (x.email && norm(x.email) === n))?.id;
  };

  const leads = rows
    .map((r) => {
      const l = toLead(r, origem);
      if (!l) return null;
      const vendedor_id = acharVendedor(pick(r, "vendedor"));
      return vendedor_id ? { ...l, vendedor_id } : l;
    })
    .filter((l): l is NonNullable<typeof l> => !!l);
  // dedup dentro do próprio lote (última linha vence)
  const unique = [...new Map(leads.map((l) => [l.external_key, l])).values()];
  if (!unique.length) return { recebidos: rows.length, gravados: 0, ignorados: rows.length };

  // Upsert em lotes com as mesmas colunas: quem não traz vendedor não apaga o vendedor atual.
  const comVendedor = unique.filter((l) => "vendedor_id" in l);
  const semVendedor = unique.filter((l) => !("vendedor_id" in l));
  for (const lote of [comVendedor, semVendedor]) {
    if (!lote.length) continue;
    const { error } = await supa.from("leads").upsert(lote, { onConflict: "external_key" });
    if (error) throw new Error(error.message);
  }
  if (distribuicao && semVendedor.length) {
    // só os que continuam sem dono depois do upsert (novos ou nunca atribuídos)
    const orfaos: string[] = [];
    for (let i = 0; i < semVendedor.length; i += 200) {
      const { data } = await supa.from("leads").select("id")
        .in("external_key", semVendedor.slice(i, i + 200).map((l) => l.external_key)).is("vendedor_id", null)
        .order("created_at");
      orfaos.push(...(data ?? []).map((d) => d.id));
    }
    if (distribuicao === "roleta") await rodarRoleta(orfaos);
    else
      for (let i = 0; i < orfaos.length; i += 200)
        await supa.from("leads").update({ vendedor_id: distribuicao }).in("id", orfaos.slice(i, i + 200));
  }
  return { recebidos: rows.length, gravados: unique.length, ignorados: rows.length - leads.length };
}
