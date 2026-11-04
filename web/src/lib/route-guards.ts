import { redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

import type { Session } from "@/components/auth-view/types/session";
import { meQueryOptions } from "@/queries/me";
import { openAuthDialog } from "@/components/auth-view/auth-dialog-bus";

async function resolveSession(
  queryClient: QueryClient,
): Promise<Session | null> {
  return queryClient.ensureQueryData(meQueryOptions()).catch(() => null);
}

/**
 * Hard gate for routes an anonymous visitor has no business reaching
 * (bucket detail — guests own no buckets — and anything admin). Pops the
 * sign-in dialog remembering the target, then bounces back to the root
 * with replace so browser history stays clean.
 */
export async function requireAuth({
  location,
  context,
}: {
  location: { href: string };
  context: { queryClient: QueryClient; session: Session | null };
}) {
  const session = await resolveSession(context.queryClient);

  if (!session) {
    openAuthDialog(location.href);
    throw redirect({
      to: "/",
      search: {},
      replace: true,
    });
  }
}

/**
 * Admin pages: anonymous visitors get the sign-in dialog (same flow),
 * signed-in non-admins are sent to their dashboard.
 */
export async function requireAdmin({
  location,
  context,
}: {
  location: { href: string };
  context: { queryClient: QueryClient; session: Session | null };
}) {
  const session = await resolveSession(context.queryClient);

  if (!session) {
    openAuthDialog(location.href);
    throw redirect({
      to: "/",
      search: {},
      replace: true,
    });
  }

  if (session.role !== "admin") {
    throw redirect({
      to: "/dashboard",
    });
  }
}
