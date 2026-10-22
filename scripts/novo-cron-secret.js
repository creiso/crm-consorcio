// Gera um CRON_SECRET novo, grava na Vercel (produção) e no .env.local, e preenche o SQL do agendador.
// Uso: node scripts/novo-cron-secret.js
const { execSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");

const secret = crypto.randomBytes(24).toString("hex");
const vc = (args, input) => execSync(`npx.cmd --yes vercel@48.2.0 ${args}`, { input, stdio: [input ? "pipe" : "ignore", "ignore", "inherit"] });

try { vc("env rm CRON_SECRET production --yes"); } catch {}
vc("env add CRON_SECRET production", secret);

const env = fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "";
const linhas = env.split(/\r?\n/).filter((l) => l && !l.startsWith("CRON_SECRET="));
fs.writeFileSync(".env.local", [...linhas, `CRON_SECRET=${secret}`].join("\n") + "\n");

const sql = fs.readFileSync("supabase/004_agendador.sql", "utf8")
  .replace("https://SEU-APP.vercel.app", "https://crm-consorcio-seven.vercel.app")
  .replace("SEU_CRON_SECRET", secret);
fs.writeFileSync("supabase/004_agendador.local.sql", sql);
console.log("CRON_SECRET novo gravado na Vercel, no .env.local e em supabase/004_agendador.local.sql");
