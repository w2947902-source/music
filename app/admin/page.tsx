import { AdminPage } from "@/components/admin/AdminPage";
import { AdminGate } from "@/components/admin/AdminGate";
export default function Page() {
  return <AdminGate><AdminPage /></AdminGate>;
}
