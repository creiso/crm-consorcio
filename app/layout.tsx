import "./globals.css";
import Link from "next/link";

export const metadata = { title: "CRM Consórcio" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <nav className="nav">
          <strong>CRM Consórcio</strong>
          <Link href="/">Dashboard</Link>
          <Link href="/kanban">Kanban</Link>
          <Link href="/importar">Importar leads</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
