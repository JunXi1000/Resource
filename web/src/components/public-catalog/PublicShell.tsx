import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Search, UserPlus } from "lucide-react";
import { useState } from "react";
import type { FC, FormEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Paper } from "@/components/ui/paper";
import { Highlight } from "@/components/ui/highlight";
import { useConfig } from "@/hooks/useConfig";
import { useSession } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

/**
 * Chrome for every anonymous page, styled after the looseleaf.dev docs site:
 * a cream paper top bar with highlighter-marked navigation and a search field,
 * and the page content mounted on a big taped-down paper sheet.
 */
export const PublicShell: FC<{ children: ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const config = useConfig();
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    navigate({ to: "/search", search: { q: term.trim() || undefined } });
  };

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="bg-card sticky top-0 z-30 border-b border-[--ll-pencil-mark]/40">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center">
            <img
              src="/safebucket_banner.png"
              alt={t("public_catalog.logo_alt")}
              className="h-8 w-auto"
            />
          </Link>

          <nav className="ml-2 hidden items-center gap-1 sm:flex">
            <PublicNavLink to="/" active={location.pathname === "/"}>
              {t("public_catalog.header.browse")}
            </PublicNavLink>
            <PublicNavLink
              to="/search"
              active={location.pathname.startsWith("/search")}
            >
              {t("public_catalog.header.search")}
            </PublicNavLink>
          </nav>

          <form
            onSubmit={submitSearch}
            className="ml-auto hidden w-full max-w-xs md:block"
          >
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder={t("public_catalog.hero.search_placeholder")}
                className="border-[--ll-pencil-mark]/50 bg-background/70 h-9 pl-9"
              />
            </div>
          </form>

          <div className={cn("flex items-center gap-2", "md:ml-3 ml-auto")}>
            {session ? (
              <Button size="sm" asChild>
                <Link to="/dashboard">
                  {t("public_catalog.header.console")}
                </Link>
              </Button>
            ) : (
              <>
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
                    {t("public_catalog.header.login")}
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 pt-10 pb-20 sm:px-6">
          <Paper
            stock="paper"
            tape="both"
            tilt={false}
            seed="public-sheet"
            className="min-h-[60vh] px-5 py-8 sm:px-10 sm:py-10"
          >
            {children}
          </Paper>
        </div>
      </main>

      <footer className="text-muted-foreground px-4 py-6 text-center text-xs sm:px-6">
        {t("public_catalog.footer", { year: new Date().getFullYear() })}
      </footer>
    </div>
  );
};

function PublicNavLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative rounded-sm px-2 py-1 text-sm whitespace-nowrap transition-colors",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {active ? (
        <Highlight tone="yellow" weight="heavy" seed={`public-nav-${to}`}>
          {children}
        </Highlight>
      ) : (
        children
      )}
    </Link>
  );
}
