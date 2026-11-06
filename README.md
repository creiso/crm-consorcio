# OnionCRM — CRM de consórcio (Next.js + Supabase + Vercel)

- **Dashboard** (`/`): volume vendido, pagamentos concluídos, ticket médio, conversão, ranking por vendedor e lista de vendas (valor, grupo/cota, vendedor, status do pagamento — clique na etiqueta para alterar).
- **Kanban** (`/kanban`): Lead → Em atendimento → Quente → Frio → Venda → Descarte. Arrastar para **Venda** abre o formulário (vendedor, valor, tipo, grupo, cota). Atualiza a cada 30 s.
- **Importar** (`/importar`): XML Spreadsheet (.xml), .xlsx, .xls, .csv + sincronização com Google Sheets.

Leads são deduplicados por `id` da planilha → telefone → e-mail. Reimportar **atualiza** os dados mas **não muda a etapa** do kanban; leads novos entram em "Lead".

## 1. Supabase
1. Crie o projeto em supabase.com.
2. SQL Editor → cole `supabase/schema.sql` → Run.
3. Cadastre os vendedores reais na tabela `vendedores` (Table Editor).
4. Settings → API: copie URL, anon key e service_role key.

## 2. Vercel
1. Suba esta pasta para um repositório GitHub e importe na Vercel.
2. Variáveis de ambiente (veja `.env.example`) + `APP_USER` e `APP_PASSWORD` (login do sistema).
3. Deploy. O `vercel.json` agenda o cron de sync a cada 10 min (no plano Hobby a Vercel só permite 1x/dia — o Apps Script abaixo cobre o tempo real).

## 3. Google Sheets — atualização contínua
Primeira linha da planilha = cabeçalhos (`nome`, `telefone`, `email`, `cidade`, `interesse`, `valor`...).

**a) Pull (backup):** Arquivo → Compartilhar → Publicar na web → CSV → cole a URL em `GOOGLE_SHEET_CSV_URL`.

**b) Push em tempo real:** Extensões → Apps Script, cole e salve:

```js
const URL = "https://SEU-APP.vercel.app/api/sheets-sync";
const SECRET = "mesmo valor de SYNC_SECRET";

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

// Dispara a cada edição: envia só as linhas alteradas
function onEditSync(e) {
  const r = e.range;
  if (r.getRow() < 2) return;
  enviar(toObjects(r.getSheet(), r.getRow(), r.getNumRows()));
}

// Sync completo (rode uma vez manualmente)
function syncTudo() {
  const s = SpreadsheetApp.getActiveSheet();
  enviar(toObjects(s, 2, s.getLastRow() - 1));
}
```

Depois: Acionadores (relógio) → Adicionar → `onEditSync` → "Da planilha" → "Ao editar" (e outro "Ao alterar" se linhas chegam por formulário/Zapier).

## Rodar local
```bash
npm install
```
```bash
npm run dev
```
(Crie `.env.local` a partir de `.env.example`.)

## Próximos passos sugeridos
- Supabase Auth com perfis (gestor vê tudo, vendedor vê só os seus leads).
- Histórico de interações/anotações por lead e tarefas de follow-up.
- Metas mensais por vendedor e score, como no painel de referência.
