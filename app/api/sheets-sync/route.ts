import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { upsertLeads } from "@/lib/leads";

export const dynamic = "force-dynamic";

// GET: puxa a planilha publicada em CSV (cron da Vercel ou botão "Sincronizar agora").
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const fromCron = auth === `Bearer ${process.env.CRON_SECRET}`;
  const fromApp = new URL(req.url).searchParams.get("manual") === "1"; // já passou pelo login do middleware
  if (!fromCron && !fromApp) return NextResponse.json({ error: "não autorizado" }, { status: 401 });

  const url = process.env.GOOGLE_SHEET_CSV_URL;
  if (!url) return NextResponse.json({ error: "GOOGLE_SHEET_CSV_URL não configurada" }, { status: 500 });

  const csv = await (await fetch(url, { cache: "no-store" })).text();
  const wb = XLSX.read(csv, { type: "string" });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
  try {
    return NextResponse.json(await upsertLeads(rows, "google_sheets"));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST: chamado pelo Google Apps Script a cada edição da planilha (tempo real).
export async function POST(req: Request) {
  if (req.headers.get("x-sync-secret") !== process.env.SYNC_SECRET)
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  const { rows } = await req.json();
  try {
    return NextResponse.json(await upsertLeads(rows ?? [], "google_sheets"));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
