import { Link, useNavigate } from "@tanstack/react-router";

import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import type { SubmitHandler } from "react-hook-form";
import type { ILoginForm } from "@/components/auth-view/types/session";
import { useLogin } from "@/hooks/useAuth";
import { mfaPending } from "@/components/mfa-view/helpers/token";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authProvidersQueryOptions } from "@/queries/auth_providers.ts";
import { ProviderType } from "@/types/auth_providers.ts";
import { AuthProvidersButtons } from "@/components/auth-providers-buttons/AuthProvidersButtons.tsx";
import { useConfig } from "@/hooks/useConfig.ts";

interface IAuthLoginFormProps {
  /** Where to navigate after a successful login (login page mode). */
  redirect?: string;
  /**
   * Called after a successful login instead of the default navigation —
   * used by the auth dialog to close itself and refresh in place.
   */
  onSuccess?: () => void;
}

/**
 * The sign-in form proper (SSO buttons + email/password), shared by the
 * standalone /auth/login page and the global auth dialog.
 */
export function AuthLoginForm({ redirect, onSuccess }: IAuthLoginFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const config = useConfig();
  const providersQuery = useSuspenseQuery(authProvidersQueryOptions());
  const providers = providersQuery.data;

  const { loginLocal } = useLogin();
  const { register, handleSubmit, watch } = useForm<ILoginForm>();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const ssoProviders = providers.filter((p) => p.type !== ProviderType.LOCAL);
  const hasLocal = providers.some((p) => p.type === ProviderType.LOCAL);
  const emailValue = watch("email") || "";
  const passwordValue = watch("password") || "";

  const handleLocalLogin: SubmitHandler<ILoginForm> = async (data) => {
    setIsLoading(true);
    setError(null);

    const result = await loginLocal(data);

    if (result.mfaRequired) {
      mfaPending.set();
      navigate({
        to: "/auth/mfa",
        search: { redirect },
      });
      onSuccess?.();
    } else if (result.success) {
      if (onSuccess) {
        onSuccess();
      } else {
        navigate({ to: redirect || "/dashboard" });
      }
    } else {
      const translated = result.error
        ? t(`errors.${result.error}`, { defaultValue: "" })
        : "";
      setError(translated || t("auth.login_error"));
    }

    setIsLoading(false);
  };

  return (
    <div className="space-y-2">
      <AuthProvidersButtons providers={ssoProviders} redirect={redirect} />

      {hasLocal && (
        <>
          {ssoProviders.length > 0 && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-primary-foreground text-muted-foreground px-2">
                  {t("auth.or_continue_with")}
                </span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit(handleLocalLogin)}>
            <div className="grid gap-2">
              <Label htmlFor="auth-dialog-email">{t("auth.email")}</Label>
              <Input
                id="auth-dialog-email"
                type="email"
                placeholder={t("auth.email_placeholder")}
                {...register("email", { required: true })}
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-2 mt-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="auth-dialog-password">
                  {t("auth.password")}
                </Label>
                <Link
                  to="/auth/reset-password"
                  className="text-primary text-sm font-medium hover:underline"
                >
                  {t("auth.forgot_password")}
                </Link>
              </div>
              <Input
                id="auth-dialog-password"
                type="password"
                {...register("password", { required: true })}
                disabled={isLoading}
              />
            </div>

            {error && <div className="text-sm text-destructive mt-2">{error}</div>}

            <Button
              type="submit"
              className="w-full mt-4"
              disabled={isLoading || !emailValue.trim() || !passwordValue.trim()}
            >
              {isLoading ? t("auth.signing_in") : t("auth.sign_in")}
            </Button>
          </form>
        </>
      )}

      {config.registrationEnabled && (
        <p className="text-muted-foreground mt-4 text-center text-sm">
          {t("auth.no_account")}{" "}
          <Link
            to="/auth/register"
            className="text-primary font-medium hover:underline"
          >
            {t("auth.sign_up")}
          </Link>
        </p>
      )}
    </div>
  );
}
