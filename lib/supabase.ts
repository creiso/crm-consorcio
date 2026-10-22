import { createClient } from "@supabase/supabase-js";

// Cliente com service role: use apenas em código de servidor (route handlers / server components).
export function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export const STATUSES = [
  { id: "lead", label: "Lead" },
  { id: "atendimento", label: "Em atendimento" },
  { id: "quente", label: "Quente" },
  { id: "frio", label: "Frio" },
  { id: "venda", label: "Venda" },
  { id: "descarte", label: "Descarte" },
] as const;

export type LeadStatus = (typeof STATUSES)[number]["id"];

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
