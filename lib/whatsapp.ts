import { db } from "./supabase";

// WhatsApp pela API própria: o conector no PC do escritório só faz conexões de saída.
// Ele envia ao CRM o que chegou e, na mesma chamada, recebe o que precisa enviar.

// resposta parada na fila por mais tempo que isso não sai mais (ficaria fora de contexto)
export const LIMITE_PENDENTE_MIN = 30;
// sem confirmação do conector depois disso, conta como falha (reenviar poderia duplicar)
export const LIMITE_ENVIANDO_MIN = 5;
// sem notícias do conector há mais tempo que isso, a tela mostra "desligado"
export const LIMITE_ONLINE_SEG = 120;

// Só dígitos e com 55: "(42) 99906-0600" → "5542999060600"
export function telefoneWhatsapp(v: string | null | undefined) {
  const d = String(v ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length < 10 || d.length > 15) return null;
  return d.length <= 11 ? "55" + d : d;
}

// O mesmo celular pode aparecer com e sem o 55 e com e sem o 9 (o WhatsApp usa os dois formatos no Brasil)
export function variacoesCelular(tel: string) {
  const local = tel.startsWith("55") && tel.length >= 12 ? tel.slice(2) : tel;
  const locais = new Set([local]);
  if (local.length === 11 && local[2] === "9") locais.add(local.slice(0, 2) + local.slice(3));
  if (local.length === 10) locais.add(local.slice(0, 2) + "9" + local.slice(2));
  return [...locais].flatMap((l) => [l, "55" + l]);
}

// Lead de cada telefone (o mais antigo, se houver mais de um)
export async function leadsDosTelefones(telefones: string[]) {
  const unicos = [...new Set(telefones)];
  const procurar = [...new Set(unicos.flatMap(variacoesCelular))];
  const achados = new Map<string, string>();
  if (!procurar.length) return achados;
  const { data } = await db().from("leads").select("id, telefone").in("telefone", procurar).order("created_at", { ascending: false });
  for (const t of unicos) {
    const variacoes = new Set(variacoesCelular(t));
    for (const l of data ?? []) if (l.telefone && variacoes.has(l.telefone)) achados.set(t, l.id);
  }
  return achados;
}
