"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "./Avatar";

// Recorta a imagem no centro em 256x256 e converte para webp antes de enviar (fica leve e sempre quadrada).
async function prepararFoto(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const lado = Math.min(img.width, img.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  canvas.getContext("2d")!.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 256, 256);
  return new Promise((ok) => canvas.toBlob((b) => ok(b!), "image/webp", 0.85));
}

export default function FotoUpload({ id, nome, foto, tamanho = 96, onChange }: {
  id?: string; nome: string; foto: string | null; tamanho?: number; onChange?: (url: string | null) => void;
}) {
  const [atual, setAtual] = useState(foto);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function enviar(file: File) {
    setBusy(true); setErro("");
    const form = new FormData();
    form.append("foto", new File([await prepararFoto(file)], "foto.webp", { type: "image/webp" }));
    if (id) form.append("id", id);
    const r = await fetch("/api/foto", { method: "POST", body: form });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErro(j.error);
    setAtual(j.foto_url); onChange?.(j.foto_url); router.refresh();
  }

  async function remover() {
    setBusy(true);
    await fetch("/api/foto", { method: "DELETE", body: JSON.stringify({ id }) });
    setBusy(false);
    setAtual(null); onChange?.(null); router.refresh();
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <button type="button" onClick={() => input.current?.click()} disabled={busy} title="Trocar foto"
        style={{ border: 0, padding: 0, background: "none", cursor: "pointer", opacity: busy ? 0.5 : 1 }}>
        <Avatar nome={nome} foto={atual} tamanho={tamanho} />
      </button>
      <div style={{ display: "grid", gap: 6 }}>
        <span style={{ display: "flex", gap: 6 }}>
          <button type="button" className="btn secondary" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? "Enviando…" : atual ? "Trocar foto" : "Enviar foto"}
          </button>
          {atual && <button type="button" className="btn secondary" disabled={busy} onClick={remover}>Remover</button>}
        </span>
        {erro && <small style={{ color: "var(--brand)" }}>{erro}</small>}
      </div>
      <input ref={input} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); e.target.value = ""; }} />
    </div>
  );
}
