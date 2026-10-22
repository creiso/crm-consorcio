import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { upsertLeads } from "@/lib/leads";
import { db } from "@/lib/supabase";
import { perfilApi } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Planilha = { id: string; nome: string; csv_url: string; vendedor_padrao_id: string | null };

async function sincronizar(p: Planilha) {
  let resultado: string;
  try {
    const resp = await fetch(p.csv_url, { cache: "no-store" });
    if (!resp.ok) throw new Error(`planilha respondeu ${resp.status}`);
    const wb = XLSX.read(await resp.text(), { type: "string" });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
    const r = await upsertLeads(rows, `sheets:${p.id}`, p.vendedor_padrao_id);
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
  const query = db().from("planilhas").select("id, nome, csv_url, vendedor_padrao_id").eq("ativo", true);

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
  return NextResponse.json({ resultados });
}

// POST ?planilha=<id>: Google Apps Script envia as linhas editadas (tempo real).
export async function POST(req: Request) {
  if (req.headers.get("x-sync-secret") !== process.env.SYNC_SECRET)
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  const planilhaId = new URL(req.url).searchParams.get("planilha");
  const { data: p } = await db().from("planilhas").select("id, vendedor_padrao_id").eq("id", planilhaId ?? "").maybeSingle();
  if (!p) return NextResponse.json({ error: "planilha não cadastrada" }, { status: 404 });

  const { rows } = await req.json();
  try {
    return NextResponse.json(await upsertLeads(rows ?? [], `sheets:${p.id}`, p.vendedor_padrao_id));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
