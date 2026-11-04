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
 *
 * During hover preloads the dialog must NOT open (that is how hovering a
 * nav link would pop sign-in) — only abort the preload; the dialog opens
 * on the real navigation (cause !== "preload").
 */
export async function requireAuth({
  location,
  context,
  preload,
  cause,
}: {
  location: { href: string };
  context: { queryClient: QueryClient; session: Session | null };
  preload?: boolean;
  cause?: "preload" | "enter" | "stay";
}) {
  const session = await resolveSession(context.queryClient);

  if (!session) {
    // Hover preloads must be side-effect free: no dialog, no redirect —
    // otherwise hovering a nav link would pop sign-in and thrash the view.
    if (preload || cause === "preload") return;
    openAuthDialog(location.href);
    throw redirect({ to: "/", search: {} });
  }
}

export async function requireAdmin({
  location,
  context,
  preload,
  cause,
}: {
  location: { href: string };
  context: { queryClient: QueryClient; session: Session | null };
  preload?: boolean;
  cause?: "preload" | "enter" | "stay";
}) {
  const session = await resolveSession(context.queryClient);

  if (!session) {
    if (preload || cause === "preload") return;
    openAuthDialog(location.href);
    throw redirect({ to: "/", search: {} });
  }

  if (session.role !== "admin") {
    throw redirect({
      to: "/dashboard",
    });
  }
}
