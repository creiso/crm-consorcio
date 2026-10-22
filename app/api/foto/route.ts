import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { perfilApi } from "@/lib/auth";

const TIPOS = ["image/jpeg", "image/png", "image/webp"];

// Envia a foto de perfil. Cada um troca a própria; admin pode trocar a de qualquer usuário (campo "id").
export async function POST(req: Request) {
  const p = await perfilApi();
  if (p instanceof NextResponse) return p;
  const form = await req.formData();
  const arquivo = form.get("foto");
  const alvo = (form.get("id") as string | null) || p.id;
  if (alvo !== p.id && p.papel !== "admin") return NextResponse.json({ error: "apenas administradores" }, { status: 403 });
  if (!(arquivo instanceof File) || !TIPOS.includes(arquivo.type))
    return NextResponse.json({ error: "Envie uma imagem JPG, PNG ou WEBP" }, { status: 400 });
  if (arquivo.size > 2 * 1024 * 1024) return NextResponse.json({ error: "Imagem maior que 2 MB" }, { status: 400 });

  const supa = db();
  const caminho = `${alvo}/${Date.now()}.${arquivo.type.split("/")[1]}`;
  const up = await supa.storage.from("avatares").upload(caminho, arquivo, { contentType: arquivo.type, upsert: true });
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });

  const foto_url = supa.storage.from("avatares").getPublicUrl(caminho).data.publicUrl;
  const { data: antigo } = await supa.from("vendedores").select("foto_url").eq("id", alvo).single();
  await supa.from("vendedores").update({ foto_url }).eq("id", alvo);

  // apaga a foto anterior para não acumular arquivos
  const anterior = antigo?.foto_url?.split("/avatares/")[1];
  if (anterior) await supa.storage.from("avatares").remove([anterior]);
  return NextResponse.json({ foto_url });
}

export async function DELETE(req: Request) {
  const p = await perfilApi();
  if (p instanceof NextResponse) return p;
  const { id } = await req.json().catch(() => ({}));
  const alvo = id || p.id;
  if (alvo !== p.id && p.papel !== "admin") return NextResponse.json({ error: "apenas administradores" }, { status: 403 });

  const supa = db();
  const { data } = await supa.from("vendedores").select("foto_url").eq("id", alvo).single();
  const caminho = data?.foto_url?.split("/avatares/")[1];
  if (caminho) await supa.storage.from("avatares").remove([caminho]);
  await supa.from("vendedores").update({ foto_url: null }).eq("id", alvo);
  return NextResponse.json({ ok: true });
}
