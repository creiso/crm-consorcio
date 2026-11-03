import { exigirPerfil } from "@/lib/auth";
import Whatsapp from "./Whatsapp";

export default async function Page() {
  await exigirPerfil("admin");
  return <Whatsapp />;
}
