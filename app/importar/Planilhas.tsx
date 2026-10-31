"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";

type Equipe = { id: string; nome: string };
type Dist = { modo: "automatica" | "manual"; equipes: string[] };
type Planilha = Dist & {
  id: string; nome: string; csv_url: string; ativo: boolean;
  ultima_sync: string | null; ultimo_resultado: string | null;
};

const PADRAO: Dist = { modo: "automatica", equipes: [] };

type StatusMeta = {
  configurado: boolean; modoTeste: boolean; sqlFaltando: boolean;
  pendentes: number | null; enviados24h: number | null; falharam: number | null; ultimoErro: string | null;
};

// Situação da API de Conversões da Meta: as mudanças de etapa dos leads vão para a Meta a cada minuto.
function CardMeta({ s }: { s: StatusMeta | null }) {
  if (!s) return null;
  const linha = (rotulo: string, valor: React.ReactNode) => <div className="det-linha"><span>{rotulo}</span><b>{valor}</b></div>;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-tit">
        <h3>Integração com a Meta (API de Conversões)</h3>
        <span>{s.configurado ? (s.modoTeste ? "🧪 modo de teste" : "✓ ativa") : "desativada"}</span>
      </div>
      {!s.configurado ? (
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
          Falta o token de acesso do conjunto de dados na Vercel (META_CAPI_TOKEN). Enquanto isso, nada é enviado à Meta.
        </p>
      ) : s.sqlFaltando ? (
        <p style={{ margin: 0, color: "#7a4f00", fontSize: 13 }}>⚠ Rode o SQL 010_meta_conversoes.sql no Supabase.</p>
      ) : (
        <>
          {linha("Enviados nas últimas 24 h", s.enviados24h)}
          {linha("Na fila (vão no próximo minuto)", s.pendentes)}
          {linha("Falharam 5 vezes", s.falharam)}
          {s.ultimoErro && linha("Último erro", <span style={{ color: "#b4232c", fontWeight: 500 }}>{s.ultimoErro}</span>)}
          <small className="nota">
            Cada mudança de etapa (Lead, Em atendimento, Quente, Frio, Reunião agendada, Reunião realizada, Venda, Descarte)
            vira um evento no Gerenciador de Eventos. Só vão leads que vieram dos formulários do Facebook/Instagram.
          </small>
        </>
      )}
    </div>
  );
}

// Frase que explica, em português simples, o que vai acontecer com os leads novos.
function resumo(d: Dist, equipes: Equipe[]) {
  const nomes = d.equipes.map((id) => equipes.find((e) => e.id === id)?.nome ?? "?");
  const alvo = nomes.length ? nomes.join(", ") : "todas as equipes";
  if (d.modo === "automatica") return `Roleta entre os consultores de ${alvo} (coordenadores não entram).`;
  if (nomes.length === 1) return `Os leads ficam sem consultor na equipe ${nomes[0]}; o coordenador dela ou o admin distribuem no Kanban.`;
  return "Os leads ficam sem consultor e sem equipe; o admin distribui no Kanban.";
}

function DistribuicaoEditor({ valor, equipes, onChange }: { valor: Dist; equipes: Equipe[]; onChange: (d: Dist) => void }) {
  const escolhendo = valor.equipes.length > 0;
  const marcar = (id: string, sim: boolean) =>
    onChange({ ...valor, equipes: sim ? [...valor.equipes, id] : valor.equipes.filter((e) => e !== id) });
  return (
    <div className="dist">
      <div className="dist-linha">
        <span className="det-label">Equipes</span>
        <div className="seg">
          <button type="button" className={!escolhendo ? "on" : ""} onClick={() => onChange({ ...valor, equipes: [] })}>Todas</button>
          <button type="button" className={escolhendo ? "on" : ""} disabled={!equipes.length}
            onClick={() => !escolhendo && equipes[0] && onChange({ ...valor, equipes: [equipes[0].id] })}>Escolher</button>
        </div>
        {!equipes.length && <small style={{ color: "var(--muted)" }}>crie equipes em <Link href="/equipes">Equipes</Link></small>}
      </div>
      {escolhendo && (
        <div className="dist-equipes">
          {equipes.map((e) => (
            <label key={e.id}>
              <input type="checkbox" checked={valor.equipes.includes(e.id)} onChange={(ev) => marcar(e.id, ev.target.checked)} /> {e.nome}
            </label>
          ))}
        </div>
      )}
      <div className="dist-linha">
        <span className="det-label">Distribuição</span>
        <div className="seg">
          <button type="button" className={valor.modo === "automatica" ? "on" : ""} onClick={() => onChange({ ...valor, modo: "automatica" })}>🎰 Automática</button>
          <button type="button" className={valor.modo === "manual" ? "on" : ""} onClick={() => onChange({ ...valor, modo: "manual" })}>✋ Manual</button>
        </div>
      </div>
      <small className="dist-resumo">{resumo(valor, equipes)}</small>
    </div>
  );
}

export default function Planilhas() {
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [planilhas, setPlanilhas] = useState<Planilha[]>([]);
  const [nova, setNova] = useState({ nome: "", csv_url: "", ...PADRAO });
  const [editando, setEditando] = useState<Planilha | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [distArquivo, setDistArquivo] = useState<Dist>(PADRAO);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<StatusMeta | null>(null);

  async function load() {
    const [e, p, m] = await Promise.all([
      fetch("/api/equipes").then((r) => r.json()), fetch("/api/planilhas").then((r) => r.json()),
      fetch("/api/meta").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    setEquipes(Array.isArray(e) ? e : []);
    setPlanilhas(Array.isArray(p) ? p : []);
    setMeta(m);
  }
  useEffect(() => { load(); }, []);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/planilhas", { method: "POST", body: JSON.stringify(nova) });
    const j = await r.json();
    if (!r.ok) return setMsg(`Erro: ${j.error}`);
    setNova({ nome: "", csv_url: "", ...PADRAO });
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

  async function salvar(p: Planilha) {
    const r = await fetch("/api/planilhas", { method: "PATCH", body: JSON.stringify(p) });
    if (!r.ok) setMsg(`Erro: ${(await r.json()).error}`);
    setEditando(null);
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
    const r = await (await fetch("/api/import", { method: "POST", body: JSON.stringify({ rows, ...distArquivo }) })).json();
    setBusy(false);
    setMsg(r.error ? `Erro: ${r.error}` : `✔ ${r.gravados} leads gravados/atualizados, ${r.ignorados} ignorados (sem nome ou contato).`);
    if (!r.error) setRows([]);
  }

  const chipsEquipes = (p: Dist) => p.equipes.length === 0
    ? <span className="pill-equipe">Todas as equipes</span>
    : p.equipes.map((id) => <span key={id} className="pill-equipe">{equipes.find((e) => e.id === id)?.nome ?? "equipe excluída"}</span>);

  return (
    <>
      <h1>Planilhas de leads</h1>
      {msg && <div className="card" style={{ marginBottom: 12 }}>{msg}</div>}

      <div className="card" style={{ marginBottom: 16, overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Google Sheets cadastradas</h3>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead><tr style={{ textAlign: "left" }}><th>Nome</th><th>Equipes e distribuição</th><th>Última sincronização</th><th>Ativa</th><th></th></tr></thead>
          <tbody>
            {planilhas.map((p) => (
              <tr key={p.id} style={{ borderTop: "1px solid #eee" }}>
                <td style={{ padding: 6, fontWeight: 600 }}>{p.nome}</td>
                <td style={{ padding: 6 }}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>{chipsEquipes(p)}</div>
                  <small style={{ color: "var(--muted)" }}>{p.modo === "manual" ? "✋ Manual" : "🎰 Automática (roleta)"}</small>{" "}
                  <button className="link-btn" onClick={() => setEditando(p)}>editar</button>
                </td>
                <td style={{ padding: 6 }}>
                  {p.ultima_sync ? new Date(p.ultima_sync).toLocaleString("pt-BR") : "nunca"}
                  <br /><small style={{ color: "var(--muted)" }}>{p.ultimo_resultado}</small>
                </td>
                <td style={{ padding: 6 }}><input type="checkbox" style={{ width: "auto" }} checked={p.ativo} onChange={(e) => salvar({ ...p, ativo: e.target.checked })} /></td>
                <td style={{ padding: 6, whiteSpace: "nowrap" }}>
                  <button className="btn" disabled={busy} onClick={() => sync(p)}>Sincronizar</button>{" "}
                  <button className="btn secondary" onClick={() => remover(p)}>Remover</button>
                </td>
              </tr>
            ))}
            {!planilhas.length && <tr><td colSpan={5} style={{ padding: 6, color: "var(--muted)" }}>Nenhuma planilha cadastrada.</td></tr>}
          </tbody>
        </table>

        <form onSubmit={cadastrar} className="nova-planilha">
          <h3 style={{ margin: 0 }}>Nova planilha</h3>
          <div className="nova-planilha-campos">
            <input placeholder="Nome (ex: Leads Facebook)" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} required />
            <input placeholder="Link da planilha (copie da barra de endereço do navegador)" value={nova.csv_url} onChange={(e) => setNova({ ...nova, csv_url: e.target.value })} required />
          </div>
          <DistribuicaoEditor valor={nova} equipes={equipes} onChange={(d) => setNova({ ...nova, ...d })} />
          <div><button className="btn">Cadastrar planilha</button></div>
        </form>
        <p style={{ fontSize: 12, color: "var(--muted)" }}>
          Padrão do formulário de leads do Facebook/Instagram reconhecido automaticamente: id, created_time, campaign_name, adset_name, ad_name,
          form_name, platform, você_sabe_como_funciona_o_consórcio?, <b>qual_sua_renda_mensal?</b> ou <b>valor_do_consorcio</b>, nome_completo, telefone e cidade.
          Também aceita email, observacoes e <b>consultor</b> (nome ou e-mail do consultor; o lead já chega com esse dono). As demais colunas ficam guardadas no lead.
          Lead que já tem dono nunca muda sozinho. Antes de cadastrar, no Google Sheets clique em <b>Compartilhar → Acesso geral → Qualquer pessoa com o link → Leitor</b>.
          Se a planilha tiver várias abas, abra a aba certa antes de copiar o link. Todas as planilhas ativas sincronizam sozinhas a cada 1 minuto.
        </p>
      </div>

      <CardMeta s={meta} />

      <div className="grid2">
        <div className="card" style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <h3 style={{ margin: 0 }}>Importar arquivo (XML, XLSX, XLS, CSV)</h3>
          <input type="file" accept=".xml,.xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && lerArquivo(e.target.files[0])} />
          <DistribuicaoEditor valor={distArquivo} equipes={equipes} onChange={setDistArquivo} />
          <div><button className="btn" disabled={!rows.length || busy} onClick={importar}>Importar {rows.length || ""} leads</button></div>
        </div>
        <div className="card" style={{ overflow: "auto", maxHeight: "50vh" }}>
          <h3 style={{ marginTop: 0 }}>Pré-visualização</h3>
          {!rows.length ? <p style={{ color: "var(--muted)" }}>Nenhum arquivo carregado.</p> : (
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

      {editando && (
        <div className="modal-bg" onClick={() => setEditando(null)}>
          <div className="modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0 }}>Distribuição — {editando.nome}</h3>
            <DistribuicaoEditor valor={editando} equipes={equipes} onChange={(d) => setEditando({ ...editando, ...d })} />
            <small style={{ color: "var(--muted)" }}>Vale para os leads novos e para os que ainda estão sem consultor. Quem já tem dono não muda.</small>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn secondary" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="btn" onClick={() => salvar(editando)}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
