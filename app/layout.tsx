import "./globals.css";
import Link from "next/link";
import { Inter } from "next/font/google";
import { getPerfil } from "@/lib/auth";
import Avatar from "./Avatar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata = { title: "CRM Consórcio" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const perfil = await getPerfil();
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>
        {perfil && (
          <nav className="nav">
            <span className="marca">CRM Consórcio</span>
            <div className="nav-links">
              {perfil.papel === "admin" && <Link href="/">Dashboard</Link>}
              <Link href="/kanban">Kanban</Link>
              {perfil.papel === "admin" && <Link href="/placar">Placar</Link>}
              {perfil.papel === "admin" && <Link href="/importar">Planilhas</Link>}
              {perfil.papel === "admin" && <Link href="/usuarios">Usuários</Link>}
            </div>
            <Link href="/perfil" className="eu" title="Meu perfil">
              <span className="eu-nome">
                {perfil.nome}
                <small>{perfil.papel === "admin" ? "Administrador" : "Vendedor"}</small>
              </span>
              <Avatar nome={perfil.nome} foto={perfil.foto_url} tamanho={34} />
            </Link>
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
