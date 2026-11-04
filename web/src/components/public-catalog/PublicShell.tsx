import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Globe, LogIn, Search, UserPlus } from "lucide-react";
import type { FC, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useConfig } from "@/hooks/useConfig";
import { useSession } from "@/hooks/useAuth";

/**
 * Chrome for every anonymous page. It deliberately does not reuse the
 * authenticated sidebar: visitors have no buckets, no upload panel and no
 * account menu, so showing one would only expose dead links.
 */
export const PublicShell: FC<{ children: ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const config = useConfig();
  const session = useSession();

  // Signed-in users browse every public page inside the authenticated layout
  // (sidebar + content sheet), the same as dashboard/activity/etc. The full
  // standalone chrome (header, footer) is for anonymous visitors only.
  if (session) {
    return <div className="px-6 py-6">{children}</div>;
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center">
            <img
              src="/safebucket_banner.png"
              alt={t("public_catalog.logo_alt")}
              className="h-9 w-auto"
            />
          </Link>

          <nav className="ml-4 hidden items-center gap-1 sm:flex">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/">
                <Globe className="mr-2 h-4 w-4" />
                {t("public_catalog.header.browse")}
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/search">
                <Search className="mr-2 h-4 w-4" />
                {t("public_catalog.header.search")}
              </Link>
            </Button>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {config.registrationEnabled && (
              <Button variant="ghost" size="sm" asChild>
                <Link to="/auth/register">
                  <UserPlus className="mr-2 h-4 w-4" />
                  {t("public_catalog.header.register")}
                </Link>
              </Button>
            )}
            <Button size="sm" asChild>
              <Link to="/auth/login">
                <LogIn className="mr-2 h-4 w-4" />
                {t("public_catalog.header.login")}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          {children}
        </div>
      </main>

      <footer className="text-muted-foreground border-t px-4 py-6 text-center text-xs sm:px-6">
        {t("public_catalog.footer", { year: new Date().getFullYear() })}
      </footer>
    </div>
  );
};
