import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { FC } from "react";
import type { IPublicCategory } from "@/types/public-catalog";
import { publicCategoriesQueryOptions } from "@/queries/public-catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const CategoryChips: FC<{
  active?: string;
  onSelect: (category: string | undefined) => void;
}> = ({ active, onSelect }) => {
  const { t } = useTranslation();
  const { data: categories = [] } = useQuery(publicCategoriesQueryOptions());

  if (categories.length === 0) return null;

  const renderChip = (category: IPublicCategory | undefined) => {
    const value = category?.category;
    const isActive = active === value || (!active && !value);

    return (
      <Button
        key={value ?? "all"}
        variant={isActive ? "default" : "outline"}
        size="sm"
        onClick={() => onSelect(value)}
        className="rounded-full"
      >
        {value ?? t("public_catalog.categories.all")}
        {category && (
          <Badge variant="secondary" className="ml-2">
            {category.bucket_count}
          </Badge>
        )}
      </Button>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {renderChip(undefined)}
      {categories.map((category) => renderChip(category))}
    </div>
  );
};
