import { redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

import type { Session } from "@/components/auth-view/types/session";
import { meQueryOptions } from "@/queries/me";
import { openAuthDialog } from "@/components/auth-view/AuthDialogProvider";

async function resolveSession(
  queryClient: QueryClient,
): Promise<Session | null> {
  return queryClient.ensureQueryData(meQueryOptions()).catch(() => null);
}

/**
 * Soft auth gate: instead of sending anonymous visitors to a standalone
 * login page, drop them on the public catalog and pop the sign-in dialog
 * (remembering where they wanted to go). After a successful login the
 * dialog navigates back to the original destination.
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
    throw redirect({ to: "/", search: {} });
  }
}

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
    throw redirect({ to: "/", search: {} });
  }

  if (session.role !== "admin") {
    throw redirect({
      to: "/dashboard",
    });
  }
}
