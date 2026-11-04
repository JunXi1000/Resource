import { redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

import type { Session } from "@/components/auth-view/types/session";
import { meQueryOptions } from "@/queries/me";

async function resolveSession(
  queryClient: QueryClient,
): Promise<Session | null> {
  return queryClient.ensureQueryData(meQueryOptions()).catch(() => null);
}

/**
 * Hard gate for routes an anonymous visitor has no business reaching
 * (bucket detail — guests own no buckets — and anything admin).
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
    throw redirect({
      to: "/auth/login",
      search: {
        redirect: location.href,
      },
    });
  }
}

/**
 * Admin pages stay hard-gated: anonymous visitors are sent to the
 * standalone sign-in page. Regular pages gate through the auth dialog
 * flow instead.
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
    throw redirect({
      to: "/auth/login",
      search: {
        redirect: location.href,
      },
    });
  }

  if (session.role !== "admin") {
    throw redirect({
      to: "/dashboard",
    });
  }
}
