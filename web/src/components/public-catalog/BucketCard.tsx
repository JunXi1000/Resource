import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CalendarDays, FileText, HardDrive } from "lucide-react";
import type { FC } from "react";
import type { IPublicBucket } from "@/types/public-catalog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatFileSize } from "@/lib/utils";

export const BucketCard: FC<{ bucket: IPublicBucket }> = ({ bucket }) => {
  const { t } = useTranslation();

  return (
    <Link
      to="/b/$slug"
      params={{ slug: bucket.slug ?? "" }}
      className="group block h-full"
    >
      <Card className="h-full transition-shadow group-hover:shadow-md">
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="group-hover:text-primary line-clamp-2 text-lg transition-colors">
              {bucket.name}
            </CardTitle>
            {bucket.category && (
              <Badge variant="secondary" className="shrink-0">
                {bucket.category}
              </Badge>
            )}
          </div>
          {bucket.description && (
            <p className="text-muted-foreground line-clamp-2 text-sm">
              {bucket.description}
            </p>
          )}
        </CardHeader>
        <CardContent className="mt-auto space-y-3">
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              {t("public_catalog.bucket.file_count", {
                count: bucket.file_count,
              })}
            </span>
            <span className="inline-flex items-center gap-1">
              <HardDrive className="h-3.5 w-3.5" />
              {formatFileSize(bucket.total_size)}
            </span>
            {bucket.published_at && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                {new Date(bucket.published_at).toLocaleDateString()}
              </span>
            )}
          </div>

          {bucket.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {bucket.tags.slice(0, 4).map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
};
