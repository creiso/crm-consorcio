import { NextResponse } from "next/server";
import { perfilApi } from "@/lib/auth";
import { simularResposta, type TurnoIa } from "@/lib/ia";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// O que a IA responderia a esta conversa, com a configuração salva. Não envia nada no WhatsApp.
export async function POST(req: Request) {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const { mensagens } = await req.json().catch(() => ({})) as { mensagens?: TurnoIa[] };
  const turnos = (mensagens ?? []).slice(-30).map((m) => ({ de: m.de === "cliente" ? "cliente" as const : "equipe" as const, texto: String(m.texto ?? "") })).filter((m) => m.texto.trim());
  if (turnos[turnos.length - 1]?.de !== "cliente") return NextResponse.json({ error: "Escreva a mensagem do cliente." }, { status: 400 });
  try {
    return NextResponse.json(await simularResposta(turnos));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
