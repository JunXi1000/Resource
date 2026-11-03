import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FolderOpen } from "lucide-react";
import type { FC } from "react";
import type { IPublicBucketQuery } from "@/types/public-catalog";
import { publicBucketsInfiniteQueryOptions } from "@/queries/public-catalog";
import { BucketCard } from "@/components/public-catalog/BucketCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const BucketGrid: FC<{
  filters: IPublicBucketQuery;
  emptyHint?: string;
}> = ({ filters, emptyHint }) => {
  const { t } = useTranslation();

  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(publicBucketsInfiniteQueryOptions(filters));

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-44 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    const code = (error as Error).message;
    const isDisabled = code === "NOT_FOUND";

    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <FolderOpen className="text-muted-foreground mx-auto mb-3 h-8 w-8" />
        <p className="font-medium">
          {isDisabled
            ? t("public_catalog.disabled.title")
            : t("public_catalog.error")}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {isDisabled
            ? t("public_catalog.disabled.description")
            : t(`errors.${code}`, { defaultValue: "" })}
        </p>
      </div>
    );
  }

  const buckets = (data?.pages ?? []).flatMap((page) => page.data);

  if (buckets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <FolderOpen className="text-muted-foreground mx-auto mb-3 h-8 w-8" />
        <p className="text-muted-foreground text-sm">
          {emptyHint ?? t("public_catalog.empty.description")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {buckets.map((bucket) => (
          <BucketCard key={bucket.id} bucket={bucket} />
        ))}
      </div>

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
    </div>
  );
};
