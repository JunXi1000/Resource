import { createFileRoute } from "@tanstack/react-router";

import { useTranslation } from "react-i18next";
import { LogIn } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AuthLoginForm } from "@/components/auth-view/AuthLoginForm.tsx";
import { authProvidersQueryOptions } from "@/queries/auth_providers.ts";

export const Route = createFileRoute("/auth/login/")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    return {
      redirect: (search.redirect as string) || undefined,
    };
  },
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(authProvidersQueryOptions()),
  component: Login,
});

// Kept for direct URL access (bookmarks, SSO callbacks). In-app sign-in
// happens through the global auth dialog instead of navigating here.
function Login() {
  const { t } = useTranslation();
  const { redirect } = Route.useSearch();

  return (
    <div className="m-6 flex h-full items-center justify-center">
      <Card className="mx-auto w-full max-w-md" stock="slip" tape="both">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-info/10 p-3">
            <LogIn className="h-6 w-6 text-info" />
          </div>
          <CardTitle>{t("auth.sign_in_title")}</CardTitle>
          <CardDescription>{t("auth.sign_in_subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <AuthLoginForm redirect={redirect} />
        </CardContent>
      </Card>
    </div>
  );
}
