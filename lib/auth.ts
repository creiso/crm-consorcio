import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { db } from "./supabase";

export type Papel = "admin" | "coordenador" | "vendedor";
export type Perfil = { id: string; nome: string; papel: Papel; email: string | null; foto_url: string | null; equipe_id: string | null };

// Quem pode ser exigido numa página/rota: "admin" só o admin; "lider" = admin ou coordenador.
type Exigencia = "admin" | "lider";
const atende = (p: Perfil, e?: Exigencia) =>
  !e || p.papel === "admin" || (e === "lider" && p.papel === "coordenador");

export const ehLider = (p: Perfil) => p.papel === "admin" || p.papel === "coordenador";

export function authClient() {
  const store = cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch {}
      },
    },
  });
}

// Perfil do usuário logado (linha em `vendedores` ligada ao auth.users), ou null.
export async function getPerfil(): Promise<Perfil | null> {
  const { data: { user } } = await authClient().auth.getUser();
  if (!user) return null;
  const { data } = await db().from("vendedores")
    .select("id, nome, papel, email, foto_url, equipe_id").eq("user_id", user.id).eq("ativo", true).maybeSingle();
  return (data as Perfil) ?? null;
}

// Para páginas: manda para /login se não estiver logado e para o kanban se não tiver acesso.
export async function exigirPerfil(e?: Exigencia) {
  const p = await getPerfil();
  if (!p) redirect("/login");
  if (!atende(p, e)) redirect("/kanban");
  return p;
}

// Para rotas de API: devolve o perfil ou uma resposta de erro pronta.
export async function perfilApi(e?: Exigencia): Promise<Perfil | NextResponse> {
  const p = await getPerfil();
  if (!p) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (!atende(p, e)) return NextResponse.json({ error: e === "admin" ? "apenas administradores" : "sem permissão" }, { status: 403 });
  return p;
}
