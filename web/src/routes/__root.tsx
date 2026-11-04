import { TanStackDevtools } from "@tanstack/react-devtools";
import {
  Outlet,
  createRootRouteWithContext,
  useLocation,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import type { QueryClient } from "@tanstack/react-query";

import type { Session } from "@/components/auth-view/types/session";
import { AuthDialogProvider } from "@/components/auth-view/AuthDialogProvider.tsx";
import { AppSidebar } from "@/components/app-sidebar/AppSidebar.tsx";
import { AppSidebarInset } from "@/components/app-sidebar/components/AppSidebarInset.tsx";
import { Toaster } from "@/components/ui/sonner.tsx";
import { UploadPanel } from "@/components/upload/components/UploadPanel";
import { EnvironmentType } from "@/types/app.ts";
import { useConfig } from "@/hooks/useConfig.ts";
import { configQueryOptions } from "@/queries/config.ts";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  session: Session | null;
}>()({
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(configQueryOptions()),
  component: RootComponent,
});

function RootComponent() {
  const { session } = Route.useRouteContext();
  const config = useConfig();
  const location = useLocation();

  const isAuthRoute = location.pathname.startsWith("/auth");
  const isShareRoute = location.pathname.startsWith("/shares");
  // Every visitor — signed in or not — gets the app chrome (sidebar +
  // content sheet). Only auth flows, share links and the pending-approval
  // interstitial render standalone without the sidebar.
  const isStandalone =
    isAuthRoute ||
    isShareRoute ||
    location.pathname.startsWith("/pending-approval");
  const showSidebar = !isStandalone;

  // The auth dialog must live INSIDE the router tree: its login form uses
  // router hooks (useNavigate/Link) which crash with a null router when
  // rendered above <RouterProvider> (that was the blank-page bug). The
  // module-level bridge in AuthDialogProvider still lets beforeLoad guards
  // open the dialog without hooks.
  return (
    <AuthDialogProvider>
      <div className="flex h-svh max-h-svh w-full overflow-hidden">
        {showSidebar && <AppSidebar />}
        {isStandalone ? (
          <div className="min-w-0 flex-1 overflow-y-auto">
            <Outlet />
          </div>
        ) : (
          <AppSidebarInset>
            <Outlet />
          </AppSidebarInset>
        )}
        {session && !isStandalone && <UploadPanel />}
        <Toaster />

        {config.environment == EnvironmentType.development && (
          <TanStackDevtools
            config={{
              position: "bottom-left",
            }}
            plugins={[
              {
                name: "TanStack Router",
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        )}
      </div>
    </AuthDialogProvider>
  );
}
