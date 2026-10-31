import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { perfilApi } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Situação da integração com a API de Conversões da Meta (tela Planilhas, só admin).
export async function GET() {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const supa = db();
  const desde = new Date(Date.now() - 24 * 3600000).toISOString();
  const base = () => supa.from("eventos_meta").select("id", { count: "exact", head: true });
  const contar = (q: ReturnType<typeof base>) => q.then((r) => (r.error ? null : r.count ?? 0));

  const [pendentes, enviados24h, falharam, ultimo] = await Promise.all([
    contar(base().is("enviado_em", null).lt("tentativas", 5)),
    contar(base().gte("enviado_em", desde).is("erro", null)),
    contar(base().is("enviado_em", null).gte("tentativas", 5)),
    supa.from("eventos_meta").select("erro, ocorrido_em").is("enviado_em", null).not("erro", "is", null)
      .order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return NextResponse.json({
    configurado: !!process.env.META_CAPI_TOKEN,
    modoTeste: !!process.env.META_TEST_EVENT_CODE,
    sqlFaltando: pendentes === null,
    pendentes, enviados24h, falharam,
    ultimoErro: ultimo.data?.erro ?? null,
  });
}
