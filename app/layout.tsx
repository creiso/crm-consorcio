import "./globals.css";
import Link from "next/link";
import { Inter } from "next/font/google";
import { getPerfil } from "@/lib/auth";
import { db } from "@/lib/supabase";
import Avatar from "./Avatar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata = { title: "OnionCRM" };

// na tela o papel "vendedor" do banco aparece como Consultor
const NIVEL = { admin: "Administrador", coordenador: "Coordenador", vendedor: "Consultor" } as const;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const perfil = await getPerfil();
  const admin = perfil?.papel === "admin";
  const lider = admin || perfil?.papel === "coordenador";
  // pedidos de "esqueci minha senha" esperando o admin (aviso no link Equipes)
  const pedidosSenha = admin
    ? await db().from("pedidos_senha").select("id", { count: "exact", head: true }).is("resolvido_em", null).then((r) => r.count ?? 0)
    : 0;
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>
        {perfil && (
          <nav className="nav">
            <span className="marca"><img src="/onioncrm.png" alt="OnionCRM" /></span>
            <div className="nav-links">
              {lider && <Link href="/">Dashboard</Link>}
              <Link href="/kanban">Kanban</Link>
              {lider && <Link href="/placar">Placar</Link>}
              {admin && <Link href="/importar">Planilhas</Link>}
              {admin && (
                <Link href="/equipes">
                  Equipes{pedidosSenha > 0 && <span className="nav-aviso" title="Pedidos de nova senha">🔑 {pedidosSenha}</span>}
                </Link>
              )}
              {admin && <Link href="/usuarios">Usuários</Link>}
              {admin && <Link href="/whatsapp">WhatsApp</Link>}
            </div>
            <Link href="/perfil" className="eu" title="Meu perfil">
              <span className="eu-nome">
                {perfil.nome}
                <small>{NIVEL[perfil.papel]}</small>
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
