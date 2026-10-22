// Foto de perfil redonda; sem foto mostra as iniciais. `tamanho` aceita px (número) ou qualquer medida CSS ("16vh").
export default function Avatar({ nome, foto, tamanho = 24 }: { nome?: string | null; foto?: string | null; tamanho?: number | string }) {
  const iniciais = (nome ?? "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  const t = typeof tamanho === "number" ? `${tamanho}px` : tamanho;
  return (
    <span className="avatar" title={nome ?? undefined}
      style={{ width: t, height: t, fontSize: `max(10px, calc(${t} * 0.38))` }}>
      {foto ? <img src={foto} alt={nome ?? ""} loading="lazy" /> : iniciais}
    </span>
  );
}
