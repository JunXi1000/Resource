import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PublicShell } from "@/components/public-catalog/PublicShell";
import { BucketGrid } from "@/components/public-catalog/BucketGrid";
import { CategoryChips } from "@/components/public-catalog/CategoryChips";
import { Button } from "@/components/ui/button";
import { Highlight } from "@/components/ui/highlight";
import { useConfig } from "@/hooks/useConfig";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { category?: string } => ({
    category: (search.category as string) || undefined,
  }),
  component: PublicHome,
});

function PublicHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const config = useConfig();
  const { category } = Route.useSearch();

  if (!config.publicCatalogEnabled) {
    return (
      <PublicShell>
        <div className="rounded-lg border border-dashed p-16 text-center">
          <p className="text-lg font-semibold">
            {t("public_catalog.disabled.title")}
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            {t("public_catalog.disabled.description")}
          </p>
          <Button className="mt-6" asChild>
            <a href="/auth/login">{t("public_catalog.header.login")}</a>
          </Button>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <section className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold">
            <Highlight tone="yellow" weight="regular" seed="home-title">
              {t("public_catalog.sections.title")}
            </Highlight>
          </h1>
          <CategoryChips
            active={category}
            onSelect={(next) =>
              navigate({
                to: "/",
                search: (prev) => ({ ...prev, category: next }),
              })
            }
          />
        </div>

        <BucketGrid filters={{ category }} />
      </section>
    </PublicShell>
  );
}
