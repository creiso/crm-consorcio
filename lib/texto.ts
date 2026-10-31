// Respostas de formulário da Meta às vezes chegam "em código": "entre_r$_2.000_a_r$_3.000".
// Aqui viram texto legível: "Entre R$ 2.000 a R$ 3.000". Texto que já está bom continua igual.
export function textoFormulario(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  if (!s) return null;
  if (s.includes("_")) s = s.replace(/_+/g, " ");
  s = s.replace(/r\$\s*/gi, "R$ ").replace(/\s+/g, " ").trim().replace(/^nao$/i, "não");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
