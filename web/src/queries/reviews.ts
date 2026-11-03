import {
  infiniteQueryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { IPage } from "@/types/public-catalog";
import { api } from "@/lib/api";
import i18n from "@/lib/i18n";

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface IReviewUploader {
  id: string;
  first_name?: string;
  last_name?: string;
  email: string;
}

export interface IReviewItem {
  id: string;
  name: string;
  extension: string;
  size: number;
  review_status: ReviewStatus;
  reject_reason?: string;
  reviewed_at?: string;
  bucket_id: string;
  bucket_name: string;
  uploader?: IReviewUploader;
  created_at: string;
}

const REVIEW_PAGE_SIZE = 25;

export const reviewQueueInfiniteQueryOptions = (status: ReviewStatus) =>
  infiniteQueryOptions({
    queryKey: ["admin", "reviews", status],
    queryFn: ({ pageParam }) =>
      api.get<IPage<IReviewItem>>("/admin/reviews", {
        params: {
          status,
          limit: REVIEW_PAGE_SIZE,
          cursor: pageParam ?? undefined,
        },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

function useInvalidateReviews() {
  const queryClient = useQueryClient();

  return () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
}

export const useApproveReviewMutation = () => {
  const invalidate = useInvalidateReviews();

  return useMutation({
    mutationFn: (fileId: string) =>
      api.post(`/admin/reviews/${fileId}/approve`),
    onSuccess: () => {
      invalidate();
      toast.success(i18n.t("admin.reviews.approved_toast"));
    },
  });
};

export const useRejectReviewMutation = () => {
  const invalidate = useInvalidateReviews();

  return useMutation({
    mutationFn: ({ fileId, reason }: { fileId: string; reason: string }) =>
      api.post(`/admin/reviews/${fileId}/reject`, { reason }),
    onSuccess: () => {
      invalidate();
      toast.success(i18n.t("admin.reviews.rejected_toast"));
    },
  });
};
