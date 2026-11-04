import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Search } from "lucide-react";
import type { FormEvent } from "react";
import { PublicShell } from "@/components/public-catalog/PublicShell";
import { CatalogBrowse } from "@/components/public-catalog/CatalogBrowse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfig } from "@/hooks/useConfig";
import { useSession } from "@/hooks/useAuth";

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
  const session = useSession();
  const { category } = Route.useSearch();
  const [term, setTerm] = useState("");

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    navigate({
      to: "/search",
      search: { q: term.trim() || undefined },
    });
  };

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
          {!session && (
            <Button className="mt-6" asChild>
              <a href="/auth/login">{t("public_catalog.header.login")}</a>
            </Button>
          )}
        </div>
      </PublicShell>
    );
  }

  // PublicShell renders standalone chrome for anonymous visitors and a light
  // inline wrapper for signed-in users (who get the sidebar layout).
  return (
    <PublicShell>
      {!session && (
        <section className="mx-auto max-w-3xl py-10 text-center sm:py-16">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("public_catalog.hero.title")}
          </h1>
          <p className="text-muted-foreground mt-3 text-base sm:text-lg">
            {t("public_catalog.hero.subtitle")}
          </p>

          <form
            onSubmit={submitSearch}
            className="mx-auto mt-6 flex w-full max-w-xl items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder={t("public_catalog.hero.search_placeholder")}
                className="h-11 pl-9"
              />
            </div>
            <Button type="submit" className="h-11">
              {t("public_catalog.hero.search")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>
        </section>
      )}

      <section>
        <CatalogBrowse category={category} />
      </section>
    </PublicShell>
  );
}
