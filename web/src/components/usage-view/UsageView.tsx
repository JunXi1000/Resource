import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Gauge, HardDrive, Timer } from "lucide-react";
import type { FC } from "react";
import { myUsageQueryOptions } from "@/queries/usage";
import { QuotaBar } from "@/components/quota-bar/QuotaBar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatFileSize } from "@/lib/utils";

export const UsageView: FC = () => {
  const { t } = useTranslation();
  const { data: usage, isLoading } = useQuery(myUsageQueryOptions());

  const quotaBytes = usage?.quota_bytes ?? 0;
  const usedBytes = usage?.used_bytes ?? 0;
  const reservedBytes = usage?.reserved_bytes ?? 0;
  const remaining =
    quotaBytes > 0 ? Math.max(0, quotaBytes - usedBytes - reservedBytes) : 0;

  return (
    <div className="container mx-auto max-w-3xl p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5" />
            {t("usage.title")}
          </CardTitle>
          <CardDescription>{t("usage.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <QuotaBar
                usedBytes={usedBytes}
                reservedBytes={reservedBytes}
                quotaBytes={quotaBytes}
              />

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <HardDrive className="h-3.5 w-3.5" />
                    {t("usage.used")}
                  </div>
                  <p className="mt-1 text-lg font-semibold">
                    {formatFileSize(usedBytes)}
                  </p>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <Timer className="h-3.5 w-3.5" />
                    {t("usage.reserved")}
                  </div>
                  <p className="mt-1 text-lg font-semibold">
                    {formatFileSize(reservedBytes)}
                  </p>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <Gauge className="h-3.5 w-3.5" />
                    {t("usage.remaining")}
                  </div>
                  <p className="mt-1 text-lg font-semibold">
                    {quotaBytes > 0
                      ? formatFileSize(remaining)
                      : t("usage.unlimited")}
                  </p>
                </div>
              </div>

              <p className="text-muted-foreground text-xs">{t("usage.hint")}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
