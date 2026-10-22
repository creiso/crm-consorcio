import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { perfilApi, type Papel } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PAPEIS: Papel[] = ["admin", "coordenador", "vendedor"];

export async function GET() {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const { data } = await db().from("vendedores")
    .select("id, nome, email, papel, ativo, na_roleta, foto_url, equipe_id").order("nome");
  return NextResponse.json(data ?? []);
}

// Admin cria o acesso (admin, coordenador ou vendedor) com e-mail e senha inicial.
export async function POST(req: Request) {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const { nome, email, senha, papel, equipe_id } = await req.json();
  if (!nome || !email || (senha ?? "").length < 8)
    return NextResponse.json({ error: "Nome, e-mail e senha (mín. 8 caracteres) são obrigatórios" }, { status: 400 });
  const nivel: Papel = PAPEIS.includes(papel) ? papel : "vendedor";
  if (nivel === "coordenador" && !equipe_id)
    return NextResponse.json({ error: "Escolha a equipe que o coordenador vai liderar" }, { status: 400 });

  const supa = db();
  const { data: u, error } = await supa.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { error: e2 } = await supa.from("vendedores").insert({
    nome, email: email.toLowerCase(), papel: nivel, user_id: u.user.id,
    equipe_id: nivel === "admin" ? null : equipe_id || null,
  });
  if (e2) {
    await supa.auth.admin.deleteUser(u.user.id);
    return NextResponse.json({ error: e2.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// Ativar/desativar, entrar/sair da roleta, trocar nível e equipe.
export async function PATCH(req: Request) {
  const p = await perfilApi("admin");
  if (p instanceof NextResponse) return p;
  const { id, ativo, na_roleta, papel, equipe_id } = await req.json();
  if (id === p.id && (ativo === false || (papel && papel !== "admin")))
    return NextResponse.json({ error: "Você não pode desativar nem tirar o admin de si mesmo" }, { status: 400 });

  const supa = db();
  const { data: atual } = await supa.from("vendedores").select("papel, equipe_id").eq("id", id).single();
  if (!atual) return NextResponse.json({ error: "usuário não encontrado" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (typeof ativo === "boolean") patch.ativo = ativo;
  if (typeof na_roleta === "boolean") patch.na_roleta = na_roleta;
  if (PAPEIS.includes(papel)) patch.papel = papel;
  if (equipe_id !== undefined) patch.equipe_id = equipe_id || null;
  if (patch.papel === "admin") patch.equipe_id = null;

  const papelFinal = (patch.papel ?? atual.papel) as Papel;
  const equipeFinal = (patch.equipe_id !== undefined ? patch.equipe_id : atual.equipe_id) as string | null;
  if (papelFinal === "coordenador" && !equipeFinal)
    return NextResponse.json({ error: "Coordenador precisa ter uma equipe" }, { status: 400 });

  const { error } = await supa.from("vendedores").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // trocou de equipe: os leads dele vão junto; vendas antigas sem equipe passam a contar para a nova
  if (patch.equipe_id !== undefined && equipeFinal !== atual.equipe_id) {
    await supa.from("leads").update({ equipe_id: equipeFinal }).eq("vendedor_id", id);
    if (equipeFinal) await supa.from("vendas").update({ equipe_id: equipeFinal }).eq("vendedor_id", id).is("equipe_id", null);
  }
  return NextResponse.json({ ok: true });
}
