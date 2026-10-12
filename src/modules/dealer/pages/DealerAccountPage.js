import { redirect } from "next/navigation";
import DealerAccountView from "./DealerAccountView";
import { loadDealerAccountData } from "../data/dealerPortal.actions";

export const dynamic = "force-dynamic";

/**
 * A dealer's landing page. The session is verified here on the server; the
 * proxy only checks that a dealer cookie is present.
 */
export default async function DealerAccountPage() {
  const data = await loadDealerAccountData();
  if (data.status !== "ok") redirect("/dealer/login");
  return <DealerAccountView dealer={data.dealer} username={data.username} />;
}
