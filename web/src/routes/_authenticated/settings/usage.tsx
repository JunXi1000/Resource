import { createFileRoute } from "@tanstack/react-router";
import { UsageView } from "@/components/usage-view/UsageView";

export const Route = createFileRoute("/_authenticated/settings/usage")({
  component: UsageView,
});
