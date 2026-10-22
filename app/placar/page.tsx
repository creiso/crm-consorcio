import { exigirPerfil } from "@/lib/auth";
import Placar from "./Placar";
import "./placar.css";

export default async function Page() {
  await exigirPerfil("admin");
  return <Placar />;
}
