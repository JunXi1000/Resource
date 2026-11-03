import {
  infiniteQueryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { IPage } from "@/types/public-catalog";
import { api } from "@/lib/api";
import i18n from "@/lib/i18n";

export type UserStatus = "pending" | "active" | "suspended";

export interface IAdminUserItem {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: "admin" | "user" | "guest";
  status: UserStatus;
  email_verified_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  quota_bytes: number;
  used_bytes: number;
  created_at: string;
}

const APPROVAL_PAGE_SIZE = 25;

export const approvalQueueInfiniteQueryOptions = (
  status: UserStatus | undefined,
  query: string,
) =>
  infiniteQueryOptions({
    queryKey: ["admin", "approvals", status ?? "all", query],
    queryFn: ({ pageParam }) =>
      api.get<IPage<IAdminUserItem>>("/admin/users", {
        params: {
          status,
          q: query || undefined,
          limit: APPROVAL_PAGE_SIZE,
          cursor: pageParam ?? undefined,
        },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

function useInvalidateApprovals() {
  const queryClient = useQueryClient();

  return () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "approvals"] });
}

export const useApproveUserMutation = () => {
  const invalidate = useInvalidateApprovals();

  return useMutation({
    mutationFn: ({
      userId,
      quotaBytes,
    }: {
      userId: string;
      quotaBytes?: number;
    }) =>
      api.post(`/admin/users/${userId}/approve`, {
        quota_bytes: quotaBytes,
      }),
    onSuccess: () => {
      invalidate();
      toast.success(i18n.t("admin.approvals.approved_toast"));
    },
  });
};

export const useRejectUserMutation = () => {
  const invalidate = useInvalidateApprovals();

  return useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason?: string }) =>
      api.post(`/admin/users/${userId}/reject`, { reason }),
    onSuccess: () => {
      invalidate();
      toast.success(i18n.t("admin.approvals.rejected_toast"));
    },
  });
};

export const useSuspendUserMutation = () => {
  const invalidate = useInvalidateApprovals();

  return useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      api.post(`/admin/users/${userId}/suspend`, { reason }),
    onSuccess: () => {
      invalidate();
      toast.success(i18n.t("admin.approvals.suspended_toast"));
    },
  });
};

export const useUpdateQuotaMutation = () => {
  const invalidate = useInvalidateApprovals();

  return useMutation({
    mutationFn: ({
      userId,
      quotaBytes,
    }: {
      userId: string;
      quotaBytes: number;
    }) =>
      api.patch(`/admin/users/${userId}/quota`, { quota_bytes: quotaBytes }),
    onSuccess: () => {
      invalidate();
      toast.success(i18n.t("admin.approvals.quota_updated_toast"));
    },
  });
};
