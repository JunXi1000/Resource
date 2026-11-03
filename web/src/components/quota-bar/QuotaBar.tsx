import { useTranslation } from "react-i18next";
import type { FC } from "react";
import { Progress } from "@/components/ui/progress";
import { cn, formatFileSize } from "@/lib/utils";

/**
 * One bar, two segments: settled bytes and bytes held by in-flight uploads.
 * They are shown together because that is what actually blocks the next
 * upload — showing settled usage alone would make the quota look free right up
 * until the server answers 413.
 */
export const QuotaBar: FC<{
  usedBytes: number;
  reservedBytes: number;
  quotaBytes: number;
  className?: string;
}> = ({ usedBytes, reservedBytes, quotaBytes, className }) => {
  const { t } = useTranslation();
  const committed = usedBytes + reservedBytes;
  const isUnlimited = quotaBytes <= 0;
  const percent = isUnlimited
    ? 0
    : Math.min(100, Math.round((committed / quotaBytes) * 100));

  return (
    <div className={cn("space-y-2", className)}>
      <Progress
        value={isUnlimited ? 100 : percent}
        className={isUnlimited ? "opacity-40" : undefined}
      />
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span>
          {isUnlimited
            ? t("usage.unlimited")
            : t("usage.percent_used", { percent })}
        </span>
        <span>
          {formatFileSize(committed)}
          {isUnlimited ? "" : ` / ${formatFileSize(quotaBytes)}`}
        </span>
      </div>
    </div>
  );
};
