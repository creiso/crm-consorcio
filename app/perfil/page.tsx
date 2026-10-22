import { exigirPerfil } from "@/lib/auth";
import FotoUpload from "../FotoUpload";

export default async function Perfil() {
  const p = await exigirPerfil();
  return (
    <div className="card" style={{ maxWidth: 520, display: "grid", gap: 20 }}>
      <h1 style={{ margin: 0 }}>Meu perfil</h1>
      <FotoUpload nome={p.nome} foto={p.foto_url} />
      <div>
        <div className="det-linha"><span>Nome</span><b>{p.nome}</b></div>
        <div className="det-linha"><span>E-mail</span><b>{p.email ?? "—"}</b></div>
        <div className="det-linha"><span>Nível</span><b>{p.papel === "admin" ? "Administrador" : "Vendedor"}</b></div>
      </div>
    </div>
  );
}
