"use server";

import { getSupabaseAdmin } from "@/core/supabase/admin";
import { DEALER_ACCOUNT_TABLE, getDealerSession } from "@/core/dealer/dealerAuth";

/**
 * The signed-in dealer's own record. The dealer id comes only from the
 * verified session cookie, never from the browser, and both the login and the
 * dealer are re-checked as active on every load.
 * Returns { status: "ok", dealer, username } or { status: "no-session" }.
 */
export async function loadDealerAccountData() {
  const session = await getDealerSession();
  if (!session?.dealerId) return { status: "no-session" };

  const supabase = getSupabaseAdmin();
  const [{ data: account }, { data: dealer }] = await Promise.all([
    supabase
      .from(DEALER_ACCOUNT_TABLE)
      .select("username, is_active")
      .eq("dealer_id", session.dealerId)
      .maybeSingle(),
    supabase
      .from("psb_s_dealermaster")
      .select("dealer_id, dealer_code, dealer_name, contact_person, email, phone, mobile, address_line1, address_line2, city, state, postal_code, country, is_active")
      .eq("dealer_id", session.dealerId)
      .maybeSingle(),
  ]);

  if (!account || account.is_active === false || !dealer || dealer.is_active === false) {
    return { status: "no-session" };
  }
  return { status: "ok", dealer, username: account.username };
}
