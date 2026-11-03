import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Ban, Check, Gauge, Inbox, Search, X } from "lucide-react";
import type { FC } from "react";
import type { IAdminUserItem, UserStatus } from "@/queries/approvals";
import {
  approvalQueueInfiniteQueryOptions,
  useApproveUserMutation,
  useRejectUserMutation,
  useSuspendUserMutation,
  useUpdateQuotaMutation,
} from "@/queries/approvals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatFileSize } from "@/lib/utils";

const STATUSES: Array<UserStatus> = ["pending", "active", "suspended"];
const GIB = 1024 * 1024 * 1024;

type ReasonMode = "reject" | "suspend";

export const AdminApprovalsView: FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<UserStatus>("pending");
  const [search, setSearch] = useState("");

  const [reasonTarget, setReasonTarget] = useState<IAdminUserItem | null>(null);
  const [reasonMode, setReasonMode] = useState<ReasonMode>("reject");
  const [reason, setReason] = useState("");

  const [quotaTarget, setQuotaTarget] = useState<IAdminUserItem | null>(null);
  const [quotaGib, setQuotaGib] = useState("");

  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteQuery(approvalQueueInfiniteQueryOptions(status, search.trim()));

  const approveMutation = useApproveUserMutation();
  const rejectMutation = useRejectUserMutation();
  const suspendMutation = useSuspendUserMutation();
  const quotaMutation = useUpdateQuotaMutation();

  const items = (data?.pages ?? []).flatMap((page) => page.data);

  const openReason = (user: IAdminUserItem, mode: ReasonMode) => {
    setReasonTarget(user);
    setReasonMode(mode);
    setReason("");
  };

  const closeReason = () => {
    setReasonTarget(null);
    setReason("");
  };

  const submitReason = () => {
    if (!reasonTarget) return;
    if (reasonMode === "suspend" && reason.trim().length < 3) return;

    const onSuccess = closeReason;
    if (reasonMode === "suspend") {
      suspendMutation.mutate(
        { userId: reasonTarget.id, reason: reason.trim() },
        { onSuccess },
      );
    } else {
      rejectMutation.mutate(
        { userId: reasonTarget.id, reason: reason.trim() || undefined },
        { onSuccess },
      );
    }
  };

  const openQuota = (user: IAdminUserItem) => {
    setQuotaTarget(user);
    setQuotaGib(user.quota_bytes > 0 ? String(user.quota_bytes / GIB) : "0");
  };

  const submitQuota = () => {
    if (!quotaTarget) return;
    const parsed = Number.parseFloat(quotaGib);
    if (Number.isNaN(parsed) || parsed < 0) return;

    quotaMutation.mutate(
      { userId: quotaTarget.id, quotaBytes: Math.round(parsed * GIB) },
      { onSuccess: () => setQuotaTarget(null) },
    );
  };

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="h-5 w-5" />
            {t("admin.approvals.title")}
          </CardTitle>
          <CardDescription>{t("admin.approvals.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={status === option ? "default" : "outline"}
                  onClick={() => setStatus(option)}
                >
                  {t(`admin.approvals.status.${option}`)}
                </Button>
              ))}
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("admin.approvals.search_placeholder")}
                className="pl-8"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <p className="text-muted-foreground text-sm">
                {t("admin.approvals.empty")}
              </p>
            </div>
          ) : (
            <div className="divide-y rounded-lg border">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {item.first_name} {item.last_name}
                      </p>
                      <Badge variant="outline">{item.email}</Badge>
                      {item.role === "admin" && (
                        <Badge variant="secondary">
                          {t("admin.approvals.role_admin")}
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {t("admin.approvals.usage", {
                        used: formatFileSize(item.used_bytes),
                        quota:
                          item.quota_bytes > 0
                            ? formatFileSize(item.quota_bytes)
                            : t("admin.approvals.unlimited"),
                      })}
                      {" · "}
                      {new Date(item.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {item.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() =>
                            approveMutation.mutate({ userId: item.id })
                          }
                          disabled={approveMutation.isPending}
                        >
                          <Check className="mr-1 h-4 w-4" />
                          {t("admin.approvals.approve")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openReason(item, "reject")}
                        >
                          <X className="mr-1 h-4 w-4" />
                          {t("admin.approvals.reject")}
                        </Button>
                      </>
                    )}

                    {item.status === "active" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openReason(item, "suspend")}
                      >
                        <Ban className="mr-1 h-4 w-4" />
                        {t("admin.approvals.suspend")}
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openQuota(item)}
                    >
                      <Gauge className="mr-1 h-4 w-4" />
                      {t("admin.approvals.quota")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage
                  ? t("common.loading")
                  : t("public_catalog.load_more")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={reasonTarget !== null}
        onOpenChange={(open) => (!open ? closeReason() : undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reasonMode === "suspend"
                ? t("admin.approvals.suspend_dialog.title")
                : t("admin.approvals.reject_dialog.title")}
            </DialogTitle>
            <DialogDescription>
              {t("admin.approvals.reason_dialog.description", {
                email: reasonTarget?.email,
              })}
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("admin.approvals.reason_dialog.placeholder")}
            maxLength={500}
            rows={3}
          />

          <DialogFooter>
            <Button variant="outline" onClick={closeReason}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={submitReason}
              disabled={
                (reasonMode === "suspend" && reason.trim().length < 3) ||
                suspendMutation.isPending ||
                rejectMutation.isPending
              }
            >
              {reasonMode === "suspend"
                ? t("admin.approvals.suspend")
                : t("admin.approvals.reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={quotaTarget !== null}
        onOpenChange={(open) => (!open ? setQuotaTarget(null) : undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.approvals.quota_dialog.title")}</DialogTitle>
            <DialogDescription>
              {t("admin.approvals.quota_dialog.description", {
                email: quotaTarget?.email,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="quota">
              {t("admin.approvals.quota_dialog.label")}
            </Label>
            <Input
              id="quota"
              type="number"
              min={0}
              step={1}
              value={quotaGib}
              onChange={(event) => setQuotaGib(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {t("admin.approvals.quota_dialog.hint")}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setQuotaTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submitQuota} disabled={quotaMutation.isPending}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
