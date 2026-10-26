import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// Renova a sessão do Supabase e manda quem não está logado para /login.
// Aqui basta ler a sessão do cookie (sem ir ao servidor de login a cada clique): quem libera dados
// de verdade é o getUser() das páginas e das rotas de API, que valida o login no Supabase.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Webhook do Apps Script e cron da Vercel autenticam por segredo próprio.
  if (pathname === "/api/sheets-sync" && !req.nextUrl.searchParams.has("id")) return NextResponse.next();

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;

  const publica = pathname === "/login" || pathname === "/setup" || pathname === "/api/setup";
  if (!user && !publica) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
