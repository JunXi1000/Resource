import { de, enUS, fr, zhCN } from "date-fns/locale";
import type { Locale } from "date-fns";

const localeMap: Record<string, Locale> = {
  en: enUS,
  fr,
  de,
  zh: zhCN,
};

export function dateFnsLocale(language: string): Locale {
  const code = language.split("-")[0] ?? "en";
  return localeMap[code] ?? enUS;
}
