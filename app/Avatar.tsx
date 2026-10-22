// Foto de perfil redonda; sem foto mostra as iniciais.
export default function Avatar({ nome, foto, tamanho = 24 }: { nome?: string | null; foto?: string | null; tamanho?: number }) {
  const iniciais = (nome ?? "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return (
    <span className="avatar" title={nome ?? undefined}
      style={{ width: tamanho, height: tamanho, fontSize: Math.max(10, tamanho * 0.38) }}>
      {foto ? <img src={foto} alt={nome ?? ""} loading="lazy" /> : iniciais}
    </span>
  );
}
