// Motivos de descarte. A lista é fixa para os números baterem quando forem usados em ações e relatórios
// (ex.: voltar a falar com quem estava "sem condição agora"). "pediu_para_parar" nunca deve receber ação.
export const MOTIVOS_DESCARTE = [
  { id: "sem_interesse", label: "Sem interesse" },
  { id: "sem_condicao", label: "Sem condição financeira agora" },
  { id: "parcela_alta", label: "Achou a parcela alta" },
  { id: "prefere_financiamento", label: "Prefere financiamento" },
  { id: "quer_na_hora", label: "Quer o bem na hora, sem esperar a contemplação" },
  { id: "concorrente", label: "Fechou com outra empresa" },
  { id: "ja_tem_consorcio", label: "Já tem consórcio" },
  { id: "nao_responde", label: "Não responde" },
  { id: "contato_errado", label: "Telefone ou contato errado" },
  { id: "nao_lembra", label: "Não lembra do cadastro" },
  { id: "pediu_para_parar", label: "Pediu para não ser contatado" },
  { id: "duplicado_ou_teste", label: "Lead duplicado ou teste" },
  { id: "outro", label: "Outro" },
] as const;

export type MotivoDescarte = (typeof MOTIVOS_DESCARTE)[number]["id"];
export const MAX_OBS_DESCARTE = 300;

export const nomeDoMotivo = (id: string | null | undefined) => MOTIVOS_DESCARTE.find((m) => m.id === id)?.label ?? null;

// null = ok; senão, o que falta
export function erroDoDescarte(motivo: unknown, obs: unknown) {
  if (!MOTIVOS_DESCARTE.some((m) => m.id === motivo)) return "Escolha o motivo do descarte.";
  const texto = String(obs ?? "").trim();
  if (motivo === "outro" && !texto) return "Conte qual foi o motivo.";
  if (texto.length > MAX_OBS_DESCARTE) return `A observação passa de ${MAX_OBS_DESCARTE} caracteres.`;
  return null;
}
