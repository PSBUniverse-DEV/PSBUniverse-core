import "server-only";
import { cache } from "react";
import { getCurrentSession } from "@/core/auth/session.service";

export const ORG_NO_ACCESS = "Your session has ended. Sign in again to change the organization.";

// Every Organization Setup, seat and rank action must come from a signed-in user.
// Cached for the current request only, so several checks in one save read the session once.
const getOrgSession = cache(async () => {
  const session = await getCurrentSession();
  return session?.userId ? session : null;
});

/** The signed-in session, or throws ORG_NO_ACCESS. */
export async function requireOrgEditor() {
  const session = await getOrgSession();
  if (!session) throw new Error(ORG_NO_ACCESS);
  return session;
}
