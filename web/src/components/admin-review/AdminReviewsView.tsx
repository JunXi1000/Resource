import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, FileText, ShieldCheck, X } from "lucide-react";
import type { FC } from "react";
import type { IReviewItem, ReviewStatus } from "@/queries/reviews";
import {
  reviewQueueInfiniteQueryOptions,
  useApproveReviewMutation,
  useRejectReviewMutation,
} from "@/queries/reviews";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatFileSize } from "@/lib/utils";

const STATUSES: Array<ReviewStatus> = ["pending", "approved", "rejected"];

export const AdminReviewsView: FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ReviewStatus>("pending");
  const [rejectTarget, setRejectTarget] = useState<IReviewItem | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteQuery(reviewQueueInfiniteQueryOptions(status));

  const approveMutation = useApproveReviewMutation();
  const rejectMutation = useRejectReviewMutation();

  const items = (data?.pages ?? []).flatMap((page) => page.data);

  const closeReject = () => {
    setRejectTarget(null);
    setReason("");
  };

  const submitReject = () => {
    if (!rejectTarget || reason.trim().length < 3) return;
    rejectMutation.mutate(
      { fileId: rejectTarget.id, reason: reason.trim() },
      { onSuccess: closeReject },
    );
  };

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            {t("admin.reviews.title")}
          </CardTitle>
          <CardDescription>{t("admin.reviews.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((option) => (
              <Button
                key={option}
                size="sm"
                variant={status === option ? "default" : "outline"}
                onClick={() => setStatus(option)}
              >
                {t(`admin.reviews.status.${option}`)}
              </Button>
            ))}
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
                {t(`admin.reviews.empty.${status}`)}
              </p>
            </div>
          ) : (
            <div className="divide-y rounded-lg border">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center"
                >
                  <FileText className="text-muted-foreground hidden h-5 w-5 shrink-0 sm:block" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {item.name}
                      </p>
                      <Badge variant="outline">{item.bucket_name}</Badge>
                      {item.reject_reason && status !== "pending" && (
                        <span className="text-destructive text-xs">
                          {item.reject_reason}
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-0.5 truncate text-xs">
                      {formatFileSize(item.size)}
                      {" · "}
                      {item.uploader?.email ??
                        t("admin.reviews.unknown_uploader")}
                      {" · "}
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {status !== "approved" && (
                      <Button
                        size="sm"
                        onClick={() => approveMutation.mutate(item.id)}
                        disabled={approveMutation.isPending}
                      >
                        <Check className="mr-1 h-4 w-4" />
                        {status === "rejected"
                          ? t("admin.reviews.restore")
                          : t("admin.reviews.approve")}
                      </Button>
                    )}
                    {status !== "rejected" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRejectTarget(item)}
                      >
                        <X className="mr-1 h-4 w-4" />
                        {status === "approved"
                          ? t("admin.reviews.takedown")
                          : t("admin.reviews.reject")}
                      </Button>
                    )}
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
        open={rejectTarget !== null}
        onOpenChange={(open) => (!open ? closeReject() : undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.reviews.reject_dialog.title")}</DialogTitle>
            <DialogDescription>
              {t("admin.reviews.reject_dialog.description", {
                name: rejectTarget?.name,
              })}
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("admin.reviews.reject_dialog.placeholder")}
            maxLength={500}
            rows={4}
          />

          <DialogFooter>
            <Button variant="outline" onClick={closeReject}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={submitReject}
              disabled={reason.trim().length < 3 || rejectMutation.isPending}
            >
              {t("admin.reviews.reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
