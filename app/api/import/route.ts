import { NextResponse } from "next/server";
import { upsertLeads } from "@/lib/leads";

// Recebe as linhas já lidas no navegador (XML Spreadsheet, XLSX, XLS ou CSV).
export async function POST(req: Request) {
  const { rows } = await req.json();
  if (!Array.isArray(rows)) return NextResponse.json({ error: "rows inválido" }, { status: 400 });
  try {
    return NextResponse.json(await upsertLeads(rows, "planilha"));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
