import { TanStackDevtools } from "@tanstack/react-devtools";
import {
  Outlet,
  createRootRouteWithContext,
  useLocation,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import type { QueryClient } from "@tanstack/react-query";

import type { Session } from "@/components/auth-view/types/session";
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
  // Anonymous visitors get the standalone public chrome (own header, no
  // sidebar). Signed-in users browse the catalog like any other section:
  // inside the authenticated layout, same as dashboard/activity/etc.
  const isPublicRoute =
    (location.pathname === "/" && !session) ||
    location.pathname.startsWith("/b/") ||
    location.pathname.startsWith("/search") ||
    location.pathname.startsWith("/pending-approval");
  const isStandalone = isShareRoute || isPublicRoute;
  const showSidebar = session && !isAuthRoute && !isStandalone;

  return (
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
      {!isStandalone && <UploadPanel />}
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
  );
}
