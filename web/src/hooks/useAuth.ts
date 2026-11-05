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

export function useLogout() {
  const router = useRouter();
  const { queryClient } = useRouteContext({ from: "__root__" });

  return useCallback(async () => {
    // Revoke the session server-side, but clear locally even if the call
    // fails (offline, already-expired cookie) — a stuck "logged in" UI is
    // worse than a stale cookie.
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore — clear local state regardless
    }

    // Drop every user-scoped cache so the guest view shows empty states
    // instead of the previous account's data. Public/config caches stay.
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

    // Stay on the current page as a signed-out visitor; hard-gated routes
    // (bucket detail, admin) re-run their guards and pop the sign-in
    // dialog themselves. No jump to the login page.
    await router.invalidate();
  }, [router, queryClient]);
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
