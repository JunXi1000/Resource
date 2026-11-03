import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import type { FormEvent } from "react";
import { PublicShell } from "@/components/public-catalog/PublicShell";
import { BucketGrid } from "@/components/public-catalog/BucketGrid";
import { CategoryChips } from "@/components/public-catalog/CategoryChips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/search")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { q?: string; category?: string } => ({
    q: (search.q as string) || undefined,
    category: (search.category as string) || undefined,
  }),
  component: SearchPage,
});

function SearchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { q, category } = Route.useSearch();
  const [term, setTerm] = useState(q ?? "");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    navigate({
      to: "/search",
      search: (prev) => ({ ...prev, q: term.trim() || undefined }),
    });
  };

  return (
    <PublicShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">
            {t("public_catalog.search.title")}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("public_catalog.search.description")}
          </p>
        </div>

        <form
          onSubmit={submit}
          className="flex w-full max-w-xl items-center gap-2"
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
          </Button>
        </form>

        <CategoryChips
          active={category}
          onSelect={(next) =>
            navigate({
              to: "/search",
              search: (prev) => ({ ...prev, category: next }),
            })
          }
        />

        {q ? (
          <p className="text-muted-foreground text-sm">
            {t("public_catalog.search.results_for", { query: q })}
          </p>
        ) : null}

        <BucketGrid
          filters={{ q, category }}
          emptyHint={t("public_catalog.search.no_results")}
        />
      </div>
    </PublicShell>
  );
}
