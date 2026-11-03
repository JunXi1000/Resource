import { createFileRoute } from "@tanstack/react-router";
import { AdminApprovalsView } from "@/components/admin-approvals/AdminApprovalsView";

export const Route = createFileRoute("/_authenticated/admin/approvals")({
  component: AdminApprovalsView,
});
