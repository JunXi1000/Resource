import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import type { FC, FormEvent } from "react";
import { BucketGrid } from "@/components/public-catalog/BucketGrid";
import { CategoryChips } from "@/components/public-catalog/CategoryChips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ICatalogBrowseProps {
  category?: string;
}

/**
 * Public catalog listing rendered inside the app layout (sidebar + content
 * sheet), the same way every other section is displayed — for anonymous
 * visitors and signed-in users alike.
 */
export const CatalogBrowse: FC<ICatalogBrowseProps> = ({ category }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    navigate({
      to: "/search",
      search: { q: term.trim() || undefined },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {t("public_catalog.sections.title")}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("public_catalog.hero.subtitle")}
        </p>
      </div>

      <form
        onSubmit={submitSearch}
        className="flex w-full max-w-xl items-center gap-2"
      >
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={t("public_catalog.hero.search_placeholder")}
            className="pl-9"
          />
        </div>
        <Button type="submit">{t("public_catalog.hero.search")}</Button>
      </form>

      <CategoryChips
        active={category}
        onSelect={(next) =>
          navigate({
            to: "/",
            search: (prev) => ({ ...prev, category: next }),
          })
        }
      />

      <BucketGrid filters={{ category }} />
    </div>
  );
};
