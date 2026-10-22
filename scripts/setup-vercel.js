// Cria/liga o projeto na Vercel e grava as variáveis (exceto a chave secreta do Supabase).
// Uso: node scripts/setup-vercel.js
const { execSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");

const vc = (args, input) =>
  execSync(`npx.cmd --yes vercel@48.2.0 ${args}`, { input, stdio: [input ? "pipe" : "inherit", "inherit", "inherit"] });

const secret = () => crypto.randomBytes(24).toString("base64url");
const vars = {
  NEXT_PUBLIC_SUPABASE_URL: "https://aqqdejaoiocyykfzfkwx.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_vw1N7IozGLQeg55CJBLIGQ_aQ1zntNA",
  APP_USER: "admin",
  APP_PASSWORD: secret().slice(0, 12),
  SYNC_SECRET: secret(),
  CRON_SECRET: secret(),
};

vc("link --yes --project crm-consorcio");
try { vc("git connect https://github.com/creiso/crm-consorcio --yes"); } catch { console.log("(git connect ignorado)"); }

for (const [k, v] of Object.entries(vars)) {
  try { vc(`env rm ${k} production --yes`); } catch {}
  vc(`env add ${k} production`, v);
}

// Guarda localmente (arquivo ignorado pelo git) para você consultar depois.
fs.writeFileSync(".env.local", Object.entries(vars).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
console.log("\nOK! Senhas salvas em .env.local. Login do sistema: admin / " + vars.APP_PASSWORD);
