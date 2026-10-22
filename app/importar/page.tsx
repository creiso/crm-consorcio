"use client";
import { useState } from "react";
import * as XLSX from "xlsx";

export default function Importar() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function lerArquivo(file: File) {
    // SheetJS lê XML Spreadsheet 2003 (.xml), .xlsx, .xls e .csv
    const wb = XLSX.read(await file.arrayBuffer());
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
    setRows(data);
    setMsg(`${data.length} linhas lidas de "${file.name}". Confira e clique em Importar.`);
  }

  async function enviar() {
    setBusy(true);
    const r = await (await fetch("/api/import", { method: "POST", body: JSON.stringify({ rows }) })).json();
    setBusy(false);
    setMsg(r.error ? `Erro: ${r.error}` : `✔ ${r.gravados} leads gravados/atualizados, ${r.ignorados} ignorados (sem nome ou contato).`);
    if (!r.error) setRows([]);
  }

  async function syncSheets() {
    setBusy(true);
    const r = await (await fetch("/api/sheets-sync?manual=1")).json();
    setBusy(false);
    setMsg(r.error ? `Erro: ${r.error}` : `✔ Google Sheets: ${r.gravados} leads sincronizados.`);
  }

  const cols = rows[0] ? Object.keys(rows[0]) : [];

  return (
    <>
      <h1>Importar leads</h1>
      <div className="grid2">
        <div className="card">
          <h3>Planilha (XML, XLSX, XLS, CSV)</h3>
          <p style={{ fontSize: 13, color: "#666" }}>
            Colunas reconhecidas: nome, telefone/celular/whatsapp, email, cidade, interesse, valor, observacoes, id.
            Leads já existentes (mesmo telefone/e-mail/id) são <b>atualizados</b> sem sair da etapa do kanban.
          </p>
          <input type="file" accept=".xml,.xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && lerArquivo(e.target.files[0])} />
          <p><button className="btn" disabled={!rows.length || busy} onClick={enviar}>Importar {rows.length || ""} leads</button></p>
          <hr />
          <h3>Google Sheets</h3>
          <p style={{ fontSize: 13, color: "#666" }}>Sincroniza automaticamente (Apps Script a cada edição + cron a cada 10 min). Use o botão para forçar agora.</p>
          <button className="btn secondary" disabled={busy} onClick={syncSheets}>Sincronizar agora</button>
          {msg && <p>{msg}</p>}
        </div>
        <div className="card" style={{ overflow: "auto", maxHeight: "70vh" }}>
          <h3>Pré-visualização</h3>
          {!rows.length ? <p style={{ color: "#666" }}>Nenhum arquivo carregado.</p> : (
            <table style={{ fontSize: 12, borderCollapse: "collapse" }}>
              <thead><tr>{cols.map((c) => <th key={c} style={{ textAlign: "left", padding: 4 }}>{c}</th>)}</tr></thead>
              <tbody>
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i}>{cols.map((c) => <td key={c} style={{ padding: 4, borderTop: "1px solid #eee" }}>{String(r[c] ?? "")}</td>)}</tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
