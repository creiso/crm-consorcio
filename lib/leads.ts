import { db } from "./supabase";

type Row = Record<string, unknown>;

// Aceita variações comuns de cabeçalho das planilhas.
const ALIASES: Record<string, string[]> = {
  id: ["id", "codigo", "código", "lead_id"],
  nome: ["nome", "name", "cliente", "nome completo"],
  telefone: ["telefone", "celular", "whatsapp", "phone", "fone"],
  email: ["email", "e-mail", "mail"],
  cidade: ["cidade", "city"],
  interesse: ["interesse", "produto", "tipo"],
  valor_pretendido: ["valor", "valor pretendido", "credito", "crédito"],
  observacoes: ["observacoes", "observações", "obs"],
  vendedor: ["vendedor", "responsavel", "responsável", "consultor"],
};

const norm = (s: string) => s.trim().toLowerCase();

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

// vendedorPadraoId: atribuído aos leads NOVOS sem coluna "vendedor" (leads existentes mantêm o dono).
export async function upsertLeads(rows: Row[], origem: string, vendedorPadraoId?: string | null) {
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
  if (vendedorPadraoId) {
    for (let i = 0; i < semVendedor.length; i += 200) {
      await supa.from("leads").update({ vendedor_id: vendedorPadraoId })
        .in("external_key", semVendedor.slice(i, i + 200).map((l) => l.external_key)).is("vendedor_id", null);
    }
  }
  return { recebidos: rows.length, gravados: unique.length, ignorados: rows.length - leads.length };
}
