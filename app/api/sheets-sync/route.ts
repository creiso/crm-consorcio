import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { upsertLeads, type Distribuicao } from "@/lib/leads";
import { db } from "@/lib/supabase";
import { perfilApi } from "@/lib/auth";
import { enviarEventosMeta } from "@/lib/meta";

export const dynamic = "force-dynamic";

type Planilha = { id: string; nome: string; csv_url: string; modo: Distribuicao["modo"]; equipes: string[] | null };

const distribuicao = (p: { modo: Distribuicao["modo"]; equipes: string[] | null }): Distribuicao =>
  ({ modo: p.modo, equipes: p.equipes ?? [] });

// Link normal da planilha (…/d/<ID>/edit#gid=<GID>) vira export CSV, que não tem o cache de ~5 min
// do "Publicar na web". Exige a planilha compartilhada como "qualquer pessoa com o link pode ver".
function urlCsv(link: string) {
  const id = link.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/)?.[1];
  if (!id) return link; // link de "Publicar na web" (/d/e/...) é usado como está
  const gid = link.match(/[#&?]gid=(\d+)/)?.[1] ?? "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

async function sincronizar(p: Planilha) {
  let resultado: string;
  try {
    const resp = await fetch(urlCsv(p.csv_url), { cache: "no-store" });
    if (!resp.ok) throw new Error(`planilha respondeu ${resp.status} — ela está compartilhada como "qualquer pessoa com o link"?`);
    if ((resp.headers.get("content-type") ?? "").includes("text/html"))
      throw new Error('o Google pediu login — compartilhe a planilha como "qualquer pessoa com o link pode ver"');
    const wb = XLSX.read(await resp.text(), { type: "string" });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
    const r = await upsertLeads(rows, `sheets:${p.id}`, distribuicao(p));
    resultado = `${r.gravados} leads sincronizados, ${r.ignorados} ignorados`;
  } catch (e) {
    resultado = `Erro: ${(e as Error).message}`;
  }
  await db().from("planilhas").update({ ultima_sync: new Date().toISOString(), ultimo_resultado: resultado }).eq("id", p.id);
  return { planilha: p.nome, resultado };
}

// GET sem ?id: cron da Vercel sincroniza todas as planilhas ativas.
// GET ?id=...: botão "Sincronizar agora" do admin.
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const query = db().from("planilhas").select("id, nome, csv_url, modo, equipes").eq("ativo", true);

  if (id) {
    const p = await perfilApi("admin");
    if (p instanceof NextResponse) return p;
    query.eq("id", id);
  } else if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const { data } = await query;
  const resultados = [];
  for (const p of (data ?? []) as Planilha[]) resultados.push(await sincronizar(p));
  // aproveita a passada de cada minuto para mandar à Meta as mudanças de etapa da fila
  const meta = await enviarEventosMeta().catch((e: Error) => ({ ativo: true, erro: e.message }));
  return NextResponse.json({ resultados, meta });
}

// POST ?planilha=<id>: Google Apps Script envia as linhas editadas (tempo real).
export async function POST(req: Request) {
  if (req.headers.get("x-sync-secret") !== process.env.SYNC_SECRET)
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  const planilhaId = new URL(req.url).searchParams.get("planilha");
  const { data: p } = await db().from("planilhas").select("id, modo, equipes").eq("id", planilhaId ?? "").maybeSingle();
  if (!p) return NextResponse.json({ error: "planilha não cadastrada" }, { status: 404 });

  const { rows } = await req.json();
  try {
    return NextResponse.json(await upsertLeads(rows ?? [], `sheets:${p.id}`, distribuicao(p)));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
