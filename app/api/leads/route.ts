import { NextResponse } from "next/server";
import { db, STATUSES } from "@/lib/supabase";
import { perfilApi } from "@/lib/auth";
import { erroDoDescarte } from "@/lib/descarte";
import { parseValor } from "@/lib/leads";

export const dynamic = "force-dynamic";

// Quem vê o quê: admin vê todos (e pode filtrar ?equipe=<id> ou ?equipe=sem);
// coordenador vê os leads da equipe dele; vendedor só os leads ligados a ele.
// Cada coluna traz só os N mais recentes (?lead=50&quente=100...) e o total, para o kanban ficar leve.
export async function GET(req: Request) {
  const p = await perfilApi();
  if (p instanceof NextResponse) return p;
  const params = new URL(req.url).searchParams;
  // busca: tira caracteres que quebram o filtro do PostgREST
  const q = (params.get("q") ?? "").replace(/[,()*%]/g, " ").trim();
  const filtroEquipe = p.papel === "admin" ? params.get("equipe") : null;
  const supa = db();

  // consultores e equipes (para distribuir e filtrar) vêm junto com as colunas, em paralelo
  const vendedoresQ = supa.from("vendedores").select("id, nome, papel, equipe_id").eq("ativo", true).order("nome");
  if (p.papel === "coordenador") vendedoresQ.eq("equipe_id", p.equipe_id ?? "00000000-0000-0000-0000-000000000000");
  type Pessoa = { id: string; nome: string; papel: string; equipe_id: string | null };
  const extras: Promise<[Pessoa[], { id: string; nome: string }[]]> = p.papel === "vendedor"
    ? Promise.resolve([[{ id: p.id, nome: p.nome, papel: p.papel, equipe_id: p.equipe_id }], []])
    : Promise.all([
      vendedoresQ.then((r) => (r.data ?? []) as Pessoa[]),
      supa.from("equipes").select("id, nome").order("nome").then((r) => r.data ?? []),
    ]);

  const colunas = await Promise.all(
    STATUSES.map(async (s) => {
      const limite = Math.min(Math.max(Number(params.get(s.id)) || 50, 1), 1000);
      const query = supa.from("leads").select("*, vendedores!vendedor_id(nome, foto_url), equipes(nome)", { count: "exact" })
        .eq("status", s.id).order("criado_em", { ascending: false }).limit(limite);
      if (p.papel === "vendedor") query.eq("vendedor_id", p.id);
      if (p.papel === "coordenador") query.eq("equipe_id", p.equipe_id ?? "00000000-0000-0000-0000-000000000000");
      if (filtroEquipe === "sem") query.is("equipe_id", null);
      else if (filtroEquipe) query.eq("equipe_id", filtroEquipe);
      if (q) query.or(`nome.ilike.*${q}*,telefone.ilike.*${q.replace(/\D/g, "") || q}*,cidade.ilike.*${q}*,email.ilike.*${q}*`);
      const { data, count, error } = await query;
      return { status: s.id, leads: data ?? [], total: count ?? 0, erro: error?.message ?? null };
    })
  );
  // uma coluna com erro (ex.: etapa nova antes de rodar o SQL) não derruba o kanban inteiro
  const comErro = colunas.filter((c) => c.erro);
  if (comErro.length === colunas.length) return NextResponse.json({ error: comErro[0].erro }, { status: 500 });

  // para quem o lead pode ser passado: admin → qualquer um ativo; coordenador → a própria equipe
  const [vendedores, equipes] = await extras;

  return NextResponse.json({
    leads: colunas.flatMap((c) => c.leads),
    totais: Object.fromEntries(colunas.map((c) => [c.status, c.total])),
    colunasComErro: comErro.map((c) => c.status),
    vendedores,
    equipes: equipes ?? [],
    perfil: p,
  });
}

// Move o lead de coluna (a etapa "venda" é feita via /api/vendas).
// Admin e coordenador também trocam o vendedor (o coordenador só dentro da equipe dele).
// Reunião: "agendar" (ou trocar o horário), e depois do horário "feita" ou "nao_compareceu"
// (com nova data = remarcou). Cada reunião fica no histórico (tabela reunioes).
type AcaoReuniao = { acao: "agendar" | "feita" | "nao_compareceu"; em?: string };
type Descarte = { motivo?: string; obs?: string };

// Dados que dá para corrigir no painel do lead. Valor vira número quando dá para ler (como na planilha).
const EDITAVEIS = ["nome", "telefone", "email", "cidade", "renda", "valor_consorcio", "valor_pretendido", "conhece_consorcio", "interesse", "observacoes"] as const;
const curto = (v: unknown, max: number) => {
  const t = String(v ?? "").trim();
  return t ? t.slice(0, max) : null;
};

function lerDados(d: Record<string, unknown>) {
  const nome = String(d.nome ?? "").trim();
  if (nome.length < 2) return { erro: "Escreva o nome do lead." };
  if (nome.length > 120) return { erro: "O nome passa de 120 caracteres." };
  const digitos = String(d.telefone ?? "").replace(/\D/g, "");
  if (digitos && (digitos.length < 10 || digitos.length > 13)) return { erro: "Telefone inválido: use DDD + número." };
  const email = String(d.email ?? "").trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erro: "E-mail inválido." };
  const valor = curto(d.valor, 60);
  return {
    dados: {
      nome, telefone: digitos || null, email: email || null,
      cidade: curto(d.cidade, 120), renda: curto(d.renda, 120),
      valor_consorcio: valor, valor_pretendido: parseValor(valor),
      conhece_consorcio: curto(d.conhece_consorcio, 120), interesse: curto(d.interesse, 120),
      observacoes: curto(d.observacoes, 2000),
    } as Record<(typeof EDITAVEIS)[number], string | number | null>,
  };
}

// campo que ainda não existe no banco (SQL 019 não rodou): o resto da alteração continua valendo
const NOVOS_CAMPOS = ["motivo_descarte", "descarte_obs", "descartado_em", "campos_editados"];

export async function PATCH(req: Request) {
  const p = await perfilApi();
  if (p instanceof NextResponse) return p;
  const { id, status, vendedor_id, reuniao, descarte, dados } = await req.json() as {
    id: string; status?: string; vendedor_id?: string | null; reuniao?: AcaoReuniao; descarte?: Descarte; dados?: Record<string, unknown>;
  };
  const supa = db();

  const { data: lead } = await supa.from("leads").select("id, status, vendedor_id, equipe_id").eq("id", id).maybeSingle();
  const pode = lead && (p.papel === "admin"
    || (p.papel === "coordenador" && !!p.equipe_id && lead.equipe_id === p.equipe_id)
    || (p.papel === "vendedor" && lead.vendedor_id === p.id));
  if (!pode) return NextResponse.json({ error: "lead fora do seu acesso" }, { status: 403 });

  const patch: Record<string, unknown> = {};
  if (status !== undefined) {
    if (!STATUSES.some((s) => s.id === status) || status === "venda")
      return NextResponse.json({ error: "status inválido" }, { status: 400 });
    if (status === "reuniao" && reuniao?.acao !== "agendar")
      return NextResponse.json({ error: "informe a data e o horário da reunião" }, { status: 400 });
    patch.status = status;
    // saiu do descarte: o motivo antigo não vale mais (as ações futuras olham só quem está descartado)
    if (status !== "descarte" && lead!.status === "descarte") Object.assign(patch, { motivo_descarte: null, descarte_obs: null, descartado_em: null });
  }
  // descartar pede o motivo; sem ele (aba antiga), o lead é descartado e o motivo fica para depois
  if (descarte || status === "descarte") {
    if (status !== "descarte" && lead!.status !== "descarte") return NextResponse.json({ error: "este lead não está no descarte" }, { status: 400 });
    if (descarte) {
      const erro = erroDoDescarte(descarte.motivo, descarte.obs);
      if (erro) return NextResponse.json({ error: erro }, { status: 400 });
      Object.assign(patch, { motivo_descarte: descarte.motivo, descarte_obs: String(descarte.obs ?? "").trim() || null });
    }
    if (status === "descarte" && lead!.status !== "descarte") patch.descartado_em = new Date().toISOString();
  }
  if (dados) {
    const lido = lerDados(dados);
    if ("erro" in lido) return NextResponse.json({ error: lido.erro }, { status: 400 });
    const { data: atual } = await supa.from("leads").select("*").eq("id", id).maybeSingle();
    const mudou = EDITAVEIS.filter((c) => (atual?.[c] ?? null) !== lido.dados[c] && String(atual?.[c] ?? "") !== String(lido.dados[c] ?? ""));
    for (const c of mudou) patch[c] = lido.dados[c];
    // marca o que foi corrigido à mão: a sincronização da planilha não volta esses campos
    if (mudou.length) patch.campos_editados = [...new Set([...(atual?.campos_editados ?? []), ...mudou])];
  }
  if (reuniao) {
    const r = await acaoReuniao(id, reuniao, lead!.vendedor_id, lead!.equipe_id);
    if ("erro" in r) return NextResponse.json({ error: r.erro }, { status: 400 });
    Object.assign(patch, r.patch);
  }
  if (vendedor_id !== undefined) {
    if (p.papel === "vendedor") return NextResponse.json({ error: "apenas admin ou coordenador distribuem leads" }, { status: 403 });
    if (vendedor_id) {
      const { data: alvo } = await supa.from("vendedores").select("id, equipe_id").eq("id", vendedor_id).eq("ativo", true).maybeSingle();
      if (!alvo || (p.papel === "coordenador" && alvo.equipe_id !== p.equipe_id))
        return NextResponse.json({ error: "esse consultor não está na sua equipe" }, { status: 403 });
      patch.vendedor_id = alvo.id;
      patch.equipe_id = alvo.equipe_id; // o lead acompanha a equipe do dono
    } else {
      patch.vendedor_id = null; // volta para a fila da equipe
    }
  }

  if (!Object.keys(patch).length) return NextResponse.json({ ok: true });
  let { error } = await supa.from("leads").update(patch).eq("id", id);
  let aviso: string | undefined;
  if (error && NOVOS_CAMPOS.some((c) => error!.message.includes(c))) {
    const semNovos = Object.fromEntries(Object.entries(patch).filter(([k]) => !NOVOS_CAMPOS.includes(k)));
    ({ error } = Object.keys(semNovos).length ? await supa.from("leads").update(semNovos).eq("id", id) : { error: null });
    aviso = "Rode o SQL 019_editar_lead_e_descarte.sql no Supabase: sem ele o motivo do descarte não é guardado e a planilha pode desfazer a edição.";
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, aviso });
}

async function acaoReuniao(leadId: string, r: AcaoReuniao, vendedorId: string | null, equipeId: string | null) {
  const supa = db();
  const { data: atual, error } = await supa.from("leads")
    .select("reuniao_em, reuniao_status, reuniao_remarcacoes").eq("id", leadId).single();
  if (error || !atual) return { erro: "rode o SQL 009_reuniao.sql no Supabase para usar as reuniões" };

  const nova = r.em ? new Date(r.em) : null;
  if (r.em && (!nova || isNaN(nova.getTime()))) return { erro: "data da reunião inválida" };
  const pendente = atual.reuniao_status === "agendada";
  const passou = !!atual.reuniao_em && new Date(atual.reuniao_em).getTime() <= Date.now();
  const fecharPendente = (resultado: string) => supa.from("reunioes")
    .update({ resultado, resultado_em: new Date().toISOString() }).eq("lead_id", leadId).is("resultado", null);
  const registrar = (quando: Date) => supa.from("reunioes")
    .insert({ lead_id: leadId, vendedor_id: vendedorId, equipe_id: equipeId, agendada_para: quando.toISOString() });

  if (r.acao === "agendar") {
    if (!nova) return { erro: "informe a data e o horário da reunião" };
    if (nova.getTime() < Date.now() - 24 * 3600000) return { erro: "a data da reunião já passou" };
    if (pendente) await fecharPendente("remarcada"); // trocou o horário antes de acontecer
    await registrar(nova);
    return { patch: {
      status: "reuniao", reuniao_em: nova.toISOString(), reuniao_status: "agendada",
      // remarcação = trocar o horário antes de acontecer ou marcar de novo depois de uma falta
      reuniao_remarcacoes: (atual.reuniao_remarcacoes ?? 0) + (pendente || atual.reuniao_status === "nao_compareceu" ? 1 : 0),
    } };
  }

  // feita / não compareceu só liberam depois do horário marcado
  if (!pendente) return { erro: "este lead não tem reunião agendada" };
  if (!passou) return { erro: "o resultado só pode ser marcado depois do horário da reunião" };
  if (r.acao === "feita") {
    await fecharPendente("feita");
    return { patch: { reuniao_status: "feita" } };
  }
  await fecharPendente("nao_compareceu");
  if (!nova) return { patch: { reuniao_status: "nao_compareceu" } };
  await registrar(nova); // não apareceu e já remarcou
  return { patch: {
    status: "reuniao", reuniao_em: nova.toISOString(), reuniao_status: "agendada",
    reuniao_remarcacoes: (atual.reuniao_remarcacoes ?? 0) + 1,
  } };
}
