import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { FC } from "react";
import { BucketGrid } from "@/components/public-catalog/BucketGrid";
import { CategoryChips } from "@/components/public-catalog/CategoryChips";

interface ICatalogBrowseProps {
  category?: string;
}

/**
 * Public catalog listing rendered inside the authenticated layout (sidebar +
 * content sheet), the same way every other section is displayed. The anon
 * variant keeps its own PublicShell chrome on top of this component.
 */
export const CatalogBrowse: FC<ICatalogBrowseProps> = ({ category }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

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
