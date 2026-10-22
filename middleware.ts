import { NextRequest, NextResponse } from "next/server";

// Login simples (HTTP Basic) para o MVP. Troque por Supabase Auth quando tiver vários usuários.
export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  // Webhook do Apps Script e cron da Vercel autenticam por segredo próprio.
  if (pathname === "/api/sheets-sync" && searchParams.get("manual") !== "1") return NextResponse.next();

  const expected = "Basic " + btoa(`${process.env.APP_USER ?? "admin"}:${process.env.APP_PASSWORD ?? ""}`);
  if (process.env.APP_PASSWORD && req.headers.get("authorization") === expected) return NextResponse.next();

  return new NextResponse("Autenticação necessária", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="CRM Consorcio"' },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
