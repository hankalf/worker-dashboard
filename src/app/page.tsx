import { DashboardView } from "@/components/DashboardView";
import { fetchBoardProps } from "@/lib/boardData";

export const dynamic = "force-dynamic";

export default async function Home() {
  const props = await fetchBoardProps();
  return <DashboardView {...props} />;
}
