import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * Authenticated layout route. Pages render normally for anonymous
 * visitors (queries are session-gated and show empty states); in-page
 * actions (download / upload / create bucket) pop the sign-in dialog.
 * Gated sub-trees: bucket detail + admin re-add hard guards.
 */
export const Route = createFileRoute("/_authenticated")({
  component: () => <Outlet />,
});
