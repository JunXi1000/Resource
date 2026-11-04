import { Link, useNavigate } from "@tanstack/react-router";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { FormEvent } from "react";
import { useRegisterMutation } from "@/queries/registration";
import { useConfig } from "@/hooks/useConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface IAuthRegisterFormProps {
  /** Called after a successful registration instead of the default navigation. */
  onSuccess?: (email: string) => void;
  /** Shown when rendered inside the dialog (switch back to sign-in). */
  onSwitchToLogin?: () => void;
}

/**
 * The registration form proper, shared by the standalone /auth/register
 * page and the auth dialog (register mode).
 *
 * MUST be rendered inside the router tree (uses useNavigate/Link).
 */
export function AuthRegisterForm({
  onSuccess,
  onSwitchToLogin,
}: IAuthRegisterFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const config = useConfig();
  const registerMutation = useRegisterMutation();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!config.registrationEnabled) {
    return (
      <p className="text-muted-foreground text-center text-sm">
        {t("register.disabled.description")}
      </p>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    try {
      await registerMutation.mutateAsync({
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        email: email.trim(),
        password,
      });

      // The API answers 202 regardless of whether the address already exists,
      // so the next screen must stay neutral about what just happened.
      if (onSuccess) {
        onSuccess(email.trim());
      } else {
        navigate({
          to: "/auth/register/verify",
          search: { email: email.trim() },
        });
      }
    } catch (err) {
      setError(
        t(`errors.${(err as Error).message}`, {
          defaultValue: t("register.error"),
        }),
      );
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="register-first-name">
            {t("register.first_name")}
          </Label>
          <Input
            id="register-first-name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            autoComplete="given-name"
            disabled={registerMutation.isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="register-last-name">{t("register.last_name")}</Label>
          <Input
            id="register-last-name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            autoComplete="family-name"
            disabled={registerMutation.isPending}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-email">{t("register.email")}</Label>
        <Input
          id="register-email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          disabled={registerMutation.isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-password">{t("register.password")}</Label>
        <Input
          id="register-password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          disabled={registerMutation.isPending}
        />
        <p className="text-muted-foreground text-xs">
          {t("register.password_hint")}
        </p>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button
        type="submit"
        className="w-full"
        disabled={
          registerMutation.isPending || !email.trim() || password.length < 8
        }
      >
        {registerMutation.isPending
          ? t("register.submitting")
          : t("register.submit")}
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        {t("register.have_account")}{" "}
        {onSwitchToLogin ? (
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-primary font-medium hover:underline"
          >
            {t("register.sign_in")}
          </button>
        ) : (
          <Link
            to="/auth/login"
            className="text-primary font-medium hover:underline"
          >
            {t("register.sign_in")}
          </Link>
        )}
      </p>
    </form>
  );
}
