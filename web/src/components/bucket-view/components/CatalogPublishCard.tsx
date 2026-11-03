import { useEffect, useState } from "react";
import { ExternalLink, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { FC } from "react";
import type { IBucket } from "@/types/bucket";
import { useCatalogPublish } from "@/components/bucket-view/hooks/useCatalogPublish";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { errorToast } from "@/lib/toast";

const splitTags = (raw: string): Array<string> =>
  raw
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag, index, all) => tag !== "" && all.indexOf(tag) === index);

/**
 * Publish controls for the anonymous catalog.
 *
 * Kept out of the information card on purpose: renaming a bucket and exposing
 * it to the open internet are different decisions, and one should not be a
 * side effect of the other.
 */
export const CatalogPublishCard: FC<{ bucket: IBucket }> = ({ bucket }) => {
  const { t } = useTranslation();
  const publishMutation = useCatalogPublish(bucket.id);

  const [isPublic, setIsPublic] = useState(bucket.is_public ?? false);
  const [slug, setSlug] = useState(bucket.slug ?? "");
  const [category, setCategory] = useState(bucket.category ?? "");
  const [tags, setTags] = useState((bucket.tags ?? []).join(", "));

  useEffect(() => {
    setIsPublic(bucket.is_public ?? false);
    setSlug(bucket.slug ?? "");
    setCategory(bucket.category ?? "");
    setTags((bucket.tags ?? []).join(", "));
  }, [bucket.is_public, bucket.slug, bucket.category, bucket.tags]);

  const isDirty =
    isPublic !== (bucket.is_public ?? false) ||
    slug !== (bucket.slug ?? "") ||
    category !== (bucket.category ?? "") ||
    tags !== (bucket.tags ?? []).join(", ");

  const save = async () => {
    try {
      await publishMutation.mutateAsync({
        name: bucket.name,
        is_public: isPublic,
        slug: slug.trim(),
        category: category.trim(),
        tags: splitTags(tags),
      });
      toast.success(
        isPublic
          ? t("bucket.settings.catalog.published_toast")
          : t("bucket.settings.catalog.unpublished_toast"),
      );
    } catch (error) {
      errorToast(error as Error);
    }
  };

  const publicUrl = bucket.slug ? `/b/${bucket.slug}` : null;

  return (
    <div className="bg-card border-border overflow-hidden rounded-xl border">
      <div className="border-border flex items-start justify-between gap-4 border-b px-6 py-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <Globe className="h-4 w-4" />
            {t("bucket.settings.catalog.title")}
          </h3>
          <p className="text-muted-foreground mt-1 text-xs">
            {t("bucket.settings.catalog.description")}
          </p>
        </div>
        {bucket.is_public && (
          <Badge variant="secondary" className="shrink-0">
            {t("bucket.settings.catalog.badge_public")}
          </Badge>
        )}
      </div>

      <div className="flex flex-col gap-5 px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="catalog-public">
              {t("bucket.settings.catalog.toggle_label")}
            </Label>
            <p className="text-muted-foreground text-xs">
              {t("bucket.settings.catalog.toggle_hint")}
            </p>
          </div>
          <Switch
            id="catalog-public"
            checked={isPublic}
            onCheckedChange={setIsPublic}
            disabled={publishMutation.isPending}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label className="text-muted-foreground text-xs">
            {t("bucket.settings.catalog.slug_label")}
          </Label>
          <Input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder={t("bucket.settings.catalog.slug_placeholder")}
            className="font-mono"
            disabled={publishMutation.isPending}
          />
          <p className="text-muted-foreground text-xs">
            {t("bucket.settings.catalog.slug_hint")}
          </p>
          {isPublic && publicUrl && (
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
            >
              {publicUrl}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label className="text-muted-foreground text-xs">
              {t("bucket.settings.catalog.category_label")}
            </Label>
            <Input
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder={t("bucket.settings.catalog.category_placeholder")}
              disabled={publishMutation.isPending}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-muted-foreground text-xs">
              {t("bucket.settings.catalog.tags_label")}
            </Label>
            <Input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder={t("bucket.settings.catalog.tags_placeholder")}
              disabled={publishMutation.isPending}
            />
          </div>
        </div>
        <p className="text-muted-foreground -mt-2 text-xs">
          {t("bucket.settings.catalog.tags_hint")}
        </p>

        <div className="flex justify-end">
          <Button
            onClick={save}
            disabled={!isDirty || publishMutation.isPending}
          >
            {publishMutation.isPending
              ? t("bucket.settings.catalog.saving")
              : t("bucket.settings.catalog.save")}
          </Button>
        </div>
      </div>
    </div>
  );
};
