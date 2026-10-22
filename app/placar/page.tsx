import { exigirPerfil } from "@/lib/auth";
import Placar from "./Placar";
import "./placar.css";

export default async function Page({ searchParams }: { searchParams: { equipe?: string } }) {
  await exigirPerfil("lider");
  return <Placar equipeInicial={searchParams.equipe ?? ""} />;
}
