// Sigla da equipe para o selo: "Equipe Alfa" → "AL", "Norte Sul" → "NS"
export function siglaEquipe(nome: string) {
  const partes = nome.replace(/^(equipe|time)\s+/i, "").split(/\s+/).filter(Boolean);
  return (partes.length > 1 ? partes[0][0] + partes[1][0] : (partes[0] ?? "?").slice(0, 2)).toUpperCase();
}
