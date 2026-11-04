import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import type { FC, ReactNode } from "react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Highlight } from "@/components/ui/highlight";
import { useCurrentUser } from "@/queries/user";
import { cn } from "@/lib/utils";

/**
 * Paper top navigation bar (authenticated chrome), modelled after the
 * looseleaf.dev docs header: cream bar, highlighter-marked active section,
 * and a paper search field on the right.
 */
export const AppTopNav: FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        navigate({ to: "/search" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  const links: Array<{ to: string; label: string; match: (path: string) => boolean }> = [
    {
      to: "/dashboard",
      label: t("navigation.home"),
      match: (p) => p.startsWith("/dashboard") || p.startsWith("/buckets"),
    },
    {
      to: "/activity",
      label: t("navigation.activity"),
      match: (p) => p.startsWith("/activity"),
    },
    {
      to: "/",
      label: t("navigation.public_catalog"),
      match: (p) => p === "/",
    },
    {
      to: "/reviews",
      label: t("navigation.reviews"),
      match: (p) => p.startsWith("/reviews"),
    },
  ];

  if (user?.role === "admin") {
    links.push({
      to: "/admin/dashboard",
      label: t("navigation.administration"),
      match: (p) => p.startsWith("/admin"),
    });
  }

  links.push({
    to: "/settings/profile",
    label: t("navigation.account"),
    match: (p) => p.startsWith("/settings"),
  });

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-[--ll-pencil-mark]/40 bg-card px-3 sm:px-4">
      <SidebarTrigger className="-ml-1" />
      <Link to="/dashboard" className="ml-1 shrink-0">
        <img
          src="/safebucket_banner.png"
          alt={t("public_catalog.logo_alt")}
          className="h-8 w-auto"
        />
      </Link>

      <nav className="ml-4 flex min-w-0 items-center gap-1 overflow-x-auto sm:gap-2">
        {links.map((link) => (
          <TopNavLink
            key={link.to}
            to={link.to}
            active={link.match(location.pathname)}
          >
            {link.label}
          </TopNavLink>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <Link
          to="/search"
          className="text-muted-foreground hidden h-9 w-52 items-center gap-2 rounded-md border border-[--ll-pencil-mark]/50 bg-background/70 px-3 text-sm transition-colors hover:bg-background md:flex"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 truncate">{t("common.search")}</span>
          <kbd className="bg-muted rounded border px-1.5 py-0.5 font-mono text-[10px]">
            Ctrl K
          </kbd>
        </Link>
        <Link
          to="/search"
          aria-label={t("common.search")}
          className="text-muted-foreground hover:bg-accent inline-flex h-9 w-9 items-center justify-center rounded-md md:hidden"
        >
          <Search className="h-4 w-4" />
        </Link>
      </div>
    </header>
  );
};

function TopNavLink({
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
        "relative shrink-0 rounded-sm px-2 py-1 text-sm whitespace-nowrap transition-colors",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {active ? (
        <Highlight tone="yellow" weight="heavy" seed={`nav-${to}`}>
          {children}
        </Highlight>
      ) : (
        children
      )}
    </Link>
  );
}
