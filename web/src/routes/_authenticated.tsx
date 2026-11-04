import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AuthGate } from "@/components/auth-view/AuthGate";

/**
 * Protected layout route. The sidebar stays freely browsable — anonymous
 * visitors can open these pages, but the content sheet shows a sign-in
 * card (and the auth dialog pops once) until they sign in. In-page
 * actions (download / upload / create bucket) gate themselves too.
 */
export const Route = createFileRoute("/_authenticated")({
  component: () => (
    <AuthGate>
      <Outlet />
    </AuthGate>
  ),
});
