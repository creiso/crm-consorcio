import { exigirPerfil } from "@/lib/auth";
import Usuarios from "./Usuarios";

export default async function Page() {
  await exigirPerfil("admin");
  return <Usuarios />;
}
