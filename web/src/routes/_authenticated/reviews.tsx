import { createFileRoute } from "@tanstack/react-router";
import { AdminReviewsView } from "@/components/admin-review/AdminReviewsView";

export const Route = createFileRoute("/_authenticated/reviews")({
  component: AdminReviewsView,
});
