import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PublicShell } from "@/components/public-catalog/PublicShell";
import { CatalogBrowse } from "@/components/public-catalog/CatalogBrowse";
import { Button } from "@/components/ui/button";
import { useConfig } from "@/hooks/useConfig";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { category?: string } => ({
    category: (search.category as string) || undefined,
  }),
  component: PublicHome,
});

function PublicHome() {
  const { t } = useTranslation();
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
      <CatalogBrowse category={category} />
    </PublicShell>
  );
}
