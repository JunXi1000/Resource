import { useCallback } from "react";
import { useRouteContext, useRouter } from "@tanstack/react-router";

import type { ILoginForm, Session } from "@/components/auth-view/types/session";
import type { LoginResult } from "@/lib/auth-service";
import {
  verifyMFALogin as authVerifyMFA,
  loginWithCredentials,
  loginWithLDAP,
  loginWithProvider,
} from "@/lib/auth-service";
import { meQueryOptions } from "@/queries/me";
import { api } from "@/lib/api.ts";
import { suppressAuthDialog } from "@/components/auth-view/auth-dialog-bus";

export function useSession(): Session | null {
  const context = useRouteContext({ from: "__root__" });
  return context.session;
}

export function useLogin() {
  const router = useRouter();
  const { queryClient } = useRouteContext({ from: "__root__" });

  const loginOAuth = useCallback((provider: string) => {
    loginWithProvider(provider);
  }, []);

  const loginLocal = useCallback(
    async (credentials: ILoginForm): Promise<LoginResult> => {
      const result = await loginWithCredentials(credentials);

      if (result.success && !result.mfaRequired) {
        await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
        const session = await queryClient.fetchQuery(meQueryOptions());
        router.update({
          context: {
            queryClient,
            session,
          },
        });
      }

      return result;
    },
    [router, queryClient],
  );

  const loginLDAP = useCallback(
    async (provider: string, credentials: ILoginForm): Promise<LoginResult> => {
      const result = await loginWithLDAP(provider, credentials);

      if (result.success && !result.mfaRequired) {
        await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
        const session = await queryClient.fetchQuery(meQueryOptions());
        router.update({
          context: {
            queryClient,
            session,
          },
        });
      }

      return result;
    },
    [router, queryClient],
  );

  const verifyMFA = useCallback(
    async (
      code: string,
      deviceId?: string,
    ): Promise<{ success: boolean; error?: string }> => {
      const result = await authVerifyMFA(code, deviceId);

      if (result.success) {
        await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
        const session = await queryClient.fetchQuery(meQueryOptions());
        router.update({
          context: {
            queryClient,
            session,
          },
        });
      }

      return result;
    },
    [router, queryClient],
  );

  return {
    loginOAuth,
    loginLocal,
    loginLDAP,
    verifyMFA,
  };
}

/**
 * Clear the signed-in state locally without touching the server: drop
 * every user-scoped query cache (so the guest view shows empty states
 * instead of the previous account's data), null the session context and
 * revalidate the current route. Hard-gated routes re-run their guards
 * and pop the sign-in dialog themselves. Callers use this after the
 * server side of a sign-out (logout endpoint or session revocation).
 */
export function useSignOutLocally() {
  const router = useRouter();
  const { queryClient } = useRouteContext({ from: "__root__" });

  return useCallback(async () => {
    // Sign-out is intentional: in-flight queries are about to fail with
    // 401s whose handler would pop the sign-in dialog over the freshly
    // signed-out guest view — swallow those for a short window.
    suppressAuthDialog();

    queryClient.removeQueries({ queryKey: ["auth", "me"] });
    queryClient.removeQueries({ queryKey: ["buckets"] });
    queryClient.removeQueries({ queryKey: ["users"] });
    queryClient.removeQueries({ queryKey: ["admin"] });
    queryClient.removeQueries({ queryKey: ["mfa"] });

    router.update({
      context: {
        queryClient,
        session: null,
      },
    });

    await router.invalidate();

    // Pages whose content is entirely session-only (settings) would render
    // blank for a guest — move to the public home view. Buckets re-run
    // their guards (dialog is suppressed, so it is a plain redirect).
    const path = router.state.location.pathname;
    if (path.startsWith("/settings") || path.startsWith("/buckets")) {
      await router.navigate({ to: "/", replace: true });
    }
  }, [router, queryClient]);
}

export function useLogout() {
  const signOutLocally = useSignOutLocally();

  return useCallback(async () => {
    // Revoke the session server-side, but clear locally even if the call
    // fails (offline, already-expired cookie) — a stuck "logged in" UI is
    // worse than a stale cookie.
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore — clear local state regardless
    }
    await signOutLocally();
  }, [signOutLocally]);
}

export function useRefreshSession() {
  const router = useRouter();
  const { queryClient } = useRouteContext({ from: "__root__" });

  return useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    const session = await queryClient.fetchQuery(meQueryOptions());

    router.update({
      context: {
        queryClient,
        session,
      },
    });
  }, [router, queryClient]);
}
