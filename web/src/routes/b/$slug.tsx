import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CalendarDays, FileText, HardDrive } from "lucide-react";
import { PublicShell } from "@/components/public-catalog/PublicShell";
import { publicBucketQueryOptions } from "@/queries/public-catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatFileSize } from "@/lib/utils";

export const Route = createFileRoute("/b/$slug")({
  component: BucketLayout,
});

function BucketLayout() {
  const { t } = useTranslation();
  const { slug } = Route.useParams();

  const {
    data: bucket,
    isLoading,
    isError,
    error,
  } = useQuery({
    ...publicBucketQueryOptions(slug),
    retry: false,
  });

  if (isLoading) {
    return (
      <PublicShell>
        <Skeleton className="mb-6 h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </PublicShell>
    );
  }

  if (isError || !bucket) {
    const code = (error as Error | null)?.message ?? "NOT_FOUND";

    return (
      <PublicShell>
        <div className="rounded-lg border border-dashed p-16 text-center">
          <p className="text-lg font-semibold">
            {t("public_catalog.bucket.not_found.title")}
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            {t(`errors.${code}`, {
              defaultValue: t("public_catalog.bucket.not_found.description"),
            })}
          </p>
          <Button className="mt-6" variant="outline" asChild>
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("public_catalog.bucket.back_to_catalog")}
            </Link>
          </Button>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <div className="space-y-6">
        <div className="space-y-3">
          <Button variant="ghost" size="sm" className="-ml-2" asChild>
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("public_catalog.bucket.back_to_catalog")}
            </Link>
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold sm:text-3xl">{bucket.name}</h1>
            {bucket.category && (
              <Badge variant="secondary">{bucket.category}</Badge>
            )}
          </div>

          {bucket.description && (
            <p className="text-muted-foreground max-w-3xl text-sm">
              {bucket.description}
            </p>
          )}

          <div className="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              {t("public_catalog.bucket.file_count", {
                count: bucket.file_count,
              })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5" />
              {formatFileSize(bucket.total_size)}
            </span>
            {bucket.published_at && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                {new Date(bucket.published_at).toLocaleDateString()}
              </span>
            )}
          </div>

          {bucket.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {bucket.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-[11px]">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <Outlet />
      </div>
    </PublicShell>
  );
}
