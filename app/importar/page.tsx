import { exigirPerfil } from "@/lib/auth";
import Planilhas from "./Planilhas";

export default async function Page() {
  await exigirPerfil("admin");
  return <Planilhas />;
}
