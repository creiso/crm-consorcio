"use client";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

type Vendedor = { id: string; nome: string };
type Planilha = {
  id: string; nome: string; csv_url: string; ativo: boolean; vendedor_padrao_id: string | null; roleta: boolean;
  ultima_sync: string | null; ultimo_resultado: string | null;
};

export default function Planilhas() {
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [planilhas, setPlanilhas] = useState<Planilha[]>([]);
  const [nova, setNova] = useState({ nome: "", csv_url: "", distribuicao: "roleta" });
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [padraoArquivo, setPadraoArquivo] = useState("roleta");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [script, setScript] = useState<Planilha | null>(null);

  async function load() {
    const [l, p] = await Promise.all([fetch("/api/leads").then((r) => r.json()), fetch("/api/planilhas").then((r) => r.json())]);
    setVendedores(l.vendedores ?? []);
    setPlanilhas(Array.isArray(p) ? p : []);
  }
  useEffect(() => { load(); }, []);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/planilhas", { method: "POST", body: JSON.stringify(nova) });
    const j = await r.json();
    if (!r.ok) return setMsg(`Erro: ${j.error}`);
    setNova({ nome: "", csv_url: "", distribuicao: "roleta" });
    setMsg("Planilha cadastrada. Clique em Sincronizar para puxar os leads.");
    load();
  }

  async function sync(p: Planilha) {
    setBusy(true);
    const r = await (await fetch(`/api/sheets-sync?id=${p.id}`)).json();
    setBusy(false);
    setMsg(r.error ? `Erro: ${r.error}` : `${p.nome}: ${r.resultados?.[0]?.resultado}`);
    load();
  }

  const distDe = (p: Planilha) => (p.roleta ? "roleta" : p.vendedor_padrao_id ?? "");

  async function alterar(p: Planilha, patch: { ativo?: boolean; distribuicao?: string }) {
    await fetch("/api/planilhas", { method: "PATCH", body: JSON.stringify({ id: p.id, ativo: p.ativo, distribuicao: distDe(p), ...patch }) });
    load();
  }

  async function remover(p: Planilha) {
    if (!confirm(`Remover a planilha "${p.nome}"? Os leads já importados continuam no sistema.`)) return;
    await fetch("/api/planilhas", { method: "DELETE", body: JSON.stringify({ id: p.id }) });
    load();
  }

  async function lerArquivo(file: File) {
    // SheetJS lê XML Spreadsheet 2003 (.xml), .xlsx, .xls e .csv
    const wb = XLSX.read(await file.arrayBuffer());
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
    setRows(data);
    setMsg(`${data.length} linhas lidas de "${file.name}". Confira e clique em Importar.`);
  }

  async function importar() {
    setBusy(true);
    const r = await (await fetch("/api/import", { method: "POST", body: JSON.stringify({ rows, distribuicao: padraoArquivo }) })).json();
    setBusy(false);
    setMsg(r.error ? `Erro: ${r.error}` : `✔ ${r.gravados} leads gravados/atualizados, ${r.ignorados} ignorados (sem nome ou contato).`);
    if (!r.error) setRows([]);
  }

  const selVendedor = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="roleta">🎰 Roleta (rodízio entre vendedores)</option>
      <option value="">✋ Manual (admin distribui no kanban)</option>
      {vendedores.map((v) => <option key={v.id} value={v.id}>👤 Tudo para {v.nome}</option>)}
    </select>
  );

  return (
    <>
      <h1>Planilhas de leads</h1>
      {msg && <div className="card" style={{ marginBottom: 12 }}>{msg}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Google Sheets cadastradas</h3>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead><tr style={{ textAlign: "left" }}><th>Nome</th><th>Distribuição dos leads novos</th><th>Última sincronização</th><th>Ativa</th><th></th></tr></thead>
          <tbody>
            {planilhas.map((p) => (
              <tr key={p.id} style={{ borderTop: "1px solid #eee" }}>
                <td style={{ padding: 6 }}>{p.nome}</td>
                <td style={{ padding: 6 }}>{selVendedor(distDe(p), (v) => alterar(p, { distribuicao: v }))}</td>
                <td style={{ padding: 6 }}>
                  {p.ultima_sync ? new Date(p.ultima_sync).toLocaleString("pt-BR") : "nunca"}
                  <br /><small style={{ color: "#666" }}>{p.ultimo_resultado}</small>
                </td>
                <td style={{ padding: 6 }}><input type="checkbox" style={{ width: "auto" }} checked={p.ativo} onChange={(e) => alterar(p, { ativo: e.target.checked })} /></td>
                <td style={{ padding: 6, whiteSpace: "nowrap" }}>
                  <button className="btn" disabled={busy} onClick={() => sync(p)}>Sincronizar</button>{" "}
                  <button className="btn secondary" onClick={() => setScript(p)}>Tempo real</button>{" "}
                  <button className="btn secondary" onClick={() => remover(p)}>Remover</button>
                </td>
              </tr>
            ))}
            {!planilhas.length && <tr><td colSpan={5} style={{ padding: 6, color: "#666" }}>Nenhuma planilha cadastrada.</td></tr>}
          </tbody>
        </table>

        <form onSubmit={cadastrar} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1.3fr auto", gap: 8, marginTop: 16 }}>
          <input placeholder="Nome (ex: Leads Facebook)" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} required />
          <input placeholder="Link CSV publicado (Arquivo > Compartilhar > Publicar na web > CSV)" value={nova.csv_url} onChange={(e) => setNova({ ...nova, csv_url: e.target.value })} required />
          {selVendedor(nova.distribuicao, (v) => setNova({ ...nova, distribuicao: v }))}
          <button className="btn">Cadastrar</button>
        </form>
        <p style={{ fontSize: 12, color: "#666" }}>
          Colunas reconhecidas: nome, telefone/celular/whatsapp, email, cidade, interesse, valor, observacoes, id e <b>vendedor</b> (nome ou e-mail do vendedor).
          Leads sem a coluna vendedor seguem a distribuição escolhida (roleta, vendedor fixo ou manual); lead que já tem dono nunca muda sozinho. Todas as planilhas ativas também sincronizam automaticamente 1x por dia.
        </p>
      </div>

      <div className="grid2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Importar arquivo (XML, XLSX, XLS, CSV)</h3>
          <input type="file" accept=".xml,.xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && lerArquivo(e.target.files[0])} />
          <p>{selVendedor(padraoArquivo, setPadraoArquivo)}</p>
          <button className="btn" disabled={!rows.length || busy} onClick={importar}>Importar {rows.length || ""} leads</button>
        </div>
        <div className="card" style={{ overflow: "auto", maxHeight: "50vh" }}>
          <h3 style={{ marginTop: 0 }}>Pré-visualização</h3>
          {!rows.length ? <p style={{ color: "#666" }}>Nenhum arquivo carregado.</p> : (
            <table style={{ fontSize: 12, borderCollapse: "collapse" }}>
              <thead><tr>{Object.keys(rows[0]).map((c) => <th key={c} style={{ textAlign: "left", padding: 4 }}>{c}</th>)}</tr></thead>
              <tbody>
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i}>{Object.keys(rows[0]).map((c) => <td key={c} style={{ padding: 4, borderTop: "1px solid #eee" }}>{String(r[c] ?? "")}</td>)}</tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {script && <ScriptModal planilha={script} onClose={() => setScript(null)} />}
    </>
  );
}

// Script do Google Apps Script já preenchido para esta planilha.
function ScriptModal({ planilha, onClose }: { planilha: Planilha; onClose: () => void }) {
  const code = `const URL = "${window.location.origin}/api/sheets-sync?planilha=${planilha.id}";
const SECRET = "COLE_AQUI_O_SYNC_SECRET";

function enviar(rows) {
  UrlFetchApp.fetch(URL, {
    method: "post", contentType: "application/json",
    headers: { "x-sync-secret": SECRET },
    payload: JSON.stringify({ rows }),
  });
}

function toObjects(sheet, from, count) {
  const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  return sheet.getRange(from, 1, count, head.length).getValues()
    .map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

function onEditSync(e) {
  const r = e.range;
  if (r.getRow() < 2) return;
  enviar(toObjects(r.getSheet(), r.getRow(), r.getNumRows()));
}

function syncTudo() {
  const s = SpreadsheetApp.getActiveSheet();
  enviar(toObjects(s, 2, s.getLastRow() - 1));
}`;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: 640 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0 }}>Tempo real — {planilha.nome}</h3>
        <ol style={{ fontSize: 13, margin: 0, paddingLeft: 18 }}>
          <li>Na planilha: Extensões → Apps Script. Apague tudo e cole o código abaixo.</li>
          <li>Troque COLE_AQUI_O_SYNC_SECRET pelo SYNC_SECRET (está no arquivo .env.local da pasta do projeto).</li>
          <li>Salve. Rode <b>syncTudo</b> uma vez (▶ Executar) e autorize.</li>
          <li>Acionadores ⏰ → Adicionar → função <b>onEditSync</b> → Da planilha → Ao editar.</li>
        </ol>
        <textarea readOnly value={code} style={{ width: "100%", height: 260, fontFamily: "monospace", fontSize: 11 }} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn secondary" onClick={() => navigator.clipboard.writeText(code)}>Copiar código</button>
          <button className="btn" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
