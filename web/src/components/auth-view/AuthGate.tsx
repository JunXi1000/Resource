import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LockKeyhole, LogIn } from "lucide-react";
import type { ReactNode } from "react";

import { useSession } from "@/hooks/useAuth";
import { useAuthDialog } from "@/components/auth-view/AuthDialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Wraps the protected layout's content: signed-in users see the page,
 * anonymous visitors get a sign-in card in the content sheet and the
 * auth dialog pops once (remembering where they were, so a successful
 * login brings them right back here).
 *
 * The sidebar stays browsable — gating happens on the page content and
 * on in-page actions (download / upload / create bucket), not on nav.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const { t } = useTranslation();
  const { openAuthDialog } = useAuthDialog();

  const isOpenAllowed = !!session;

  useEffect(() => {
    if (!isOpenAllowed) {
      openAuthDialog(window.location.href);
    }
    // Only on first mount of a gated page visit.
  }, [isOpenAllowed]);

  if (isOpenAllowed) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="mx-auto w-full max-w-md" stock="slip" tape="both">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-info/10 p-3">
            <LockKeyhole className="h-6 w-6 text-info" />
          </div>
          <CardTitle>{t("auth.sign_in_title")}</CardTitle>
          <CardDescription>{t("auth.sign_in_subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <Button className="w-full" onClick={() => openAuthDialog(window.location.href)}>
            <LogIn className="mr-2 h-4 w-4" />
            {t("auth.sign_in")}
          </Button>
          <p className="text-muted-foreground text-center text-sm">
            {t("auth.sign_in_subtitle")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
