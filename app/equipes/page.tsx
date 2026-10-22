import { exigirPerfil } from "@/lib/auth";
import Equipes from "./Equipes";

export default async function Page() {
  await exigirPerfil("admin");
  return <Equipes />;
}
