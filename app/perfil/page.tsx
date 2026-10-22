import { exigirPerfil } from "@/lib/auth";
import { db } from "@/lib/supabase";
import FotoUpload from "../FotoUpload";

// na tela o papel "vendedor" do banco aparece como Consultor
const NIVEL = { admin: "Administrador", coordenador: "Coordenador", vendedor: "Consultor" } as const;

export default async function Perfil() {
  const p = await exigirPerfil();
  const { data: equipe } = p.equipe_id
    ? await db().from("equipes").select("nome").eq("id", p.equipe_id).maybeSingle()
    : { data: null };
  return (
    <div className="card" style={{ maxWidth: 520, display: "grid", gap: 20 }}>
      <h1 style={{ margin: 0 }}>Meu perfil</h1>
      <FotoUpload nome={p.nome} foto={p.foto_url} />
      <div>
        <div className="det-linha"><span>Nome</span><b>{p.nome}</b></div>
        <div className="det-linha"><span>E-mail</span><b>{p.email ?? "—"}</b></div>
        <div className="det-linha"><span>Nível</span><b>{NIVEL[p.papel]}</b></div>
        {p.papel !== "admin" && <div className="det-linha"><span>Equipe</span><b>{equipe?.nome ?? "sem equipe"}</b></div>}
      </div>
    </div>
  );
}
