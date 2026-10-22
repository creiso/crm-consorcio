import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { db } from "./supabase";

export type Perfil = { id: string; nome: string; papel: "admin" | "vendedor"; email: string | null; foto_url: string | null };

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
    .select("id, nome, papel, email, foto_url").eq("user_id", user.id).eq("ativo", true).maybeSingle();
  return (data as Perfil) ?? null;
}

// Para páginas: manda para /login se não estiver logado.
export async function exigirPerfil(papel?: "admin") {
  const p = await getPerfil();
  if (!p) redirect("/login");
  if (papel && p.papel !== papel) redirect("/");
  return p;
}

// Para rotas de API: devolve o perfil ou uma resposta de erro pronta.
export async function perfilApi(papel?: "admin"): Promise<Perfil | NextResponse> {
  const p = await getPerfil();
  if (!p) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (papel && p.papel !== papel) return NextResponse.json({ error: "apenas administradores" }, { status: 403 });
  return p;
}
