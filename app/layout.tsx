import "./globals.css";
import Link from "next/link";
import { getPerfil } from "@/lib/auth";

export const metadata = { title: "CRM Consórcio" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const perfil = await getPerfil();
  return (
    <html lang="pt-BR">
      <body>
        {perfil && (
          <nav className="nav">
            <strong>CRM Consórcio</strong>
            <Link href="/">Dashboard</Link>
            <Link href="/kanban">Kanban</Link>
            {perfil.papel === "admin" && <Link href="/importar">Planilhas</Link>}
            {perfil.papel === "admin" && <Link href="/usuarios">Usuários</Link>}
            <span style={{ marginLeft: "auto", fontSize: 13, color: "#666" }}>
              {perfil.nome} ({perfil.papel})
            </span>
            <form action="/api/logout" method="post">
              <button className="btn secondary">Sair</button>
            </form>
          </nav>
        )}
        <main>{children}</main>
      </body>
    </html>
  );
}
