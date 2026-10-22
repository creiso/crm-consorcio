import { NextResponse } from "next/server";
import { upsertLeads } from "@/lib/leads";
import { perfilApi } from "@/lib/auth";

// Recebe as linhas já lidas no navegador (XML Spreadsheet, XLSX, XLS ou CSV). Só admin.
export async function POST(req: Request) {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const { rows, vendedor_padrao_id } = await req.json();
  if (!Array.isArray(rows)) return NextResponse.json({ error: "rows inválido" }, { status: 400 });
  try {
    return NextResponse.json(await upsertLeads(rows, "planilha", vendedor_padrao_id || null));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
