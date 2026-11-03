import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { UserPlus } from "lucide-react";
import type { FormEvent } from "react";
import { useRegisterMutation } from "@/queries/registration";
import { useConfig } from "@/hooks/useConfig";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth/register/")({
  component: RegisterPage,
});

function RegisterPage() {
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
      <div className="m-6 flex h-full items-center justify-center">
        <Card className="mx-auto w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>{t("register.disabled.title")}</CardTitle>
            <CardDescription>
              {t("register.disabled.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" asChild>
              <Link to="/auth/login">
                {t("register.disabled.back_to_login")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
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
      navigate({
        to: "/auth/register/verify",
        search: { email: email.trim() },
      });
    } catch (err) {
      setError(
        t(`errors.${(err as Error).message}`, {
          defaultValue: t("register.error"),
        }),
      );
    }
  };

  return (
    <div className="m-6 flex h-full items-center justify-center">
      <Card className="mx-auto w-full max-w-md">
        <CardHeader className="text-center">
          <div className="bg-primary/10 mx-auto mb-4 h-12 w-12 rounded-full p-3">
            <UserPlus className="text-primary h-6 w-6" />
          </div>
          <CardTitle>{t("register.title")}</CardTitle>
          <CardDescription>{t("register.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="first_name">{t("register.first_name")}</Label>
                <Input
                  id="first_name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  autoComplete="given-name"
                  disabled={registerMutation.isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">{t("register.last_name")}</Label>
                <Input
                  id="last_name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  autoComplete="family-name"
                  disabled={registerMutation.isPending}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t("register.email")}</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                disabled={registerMutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t("register.password")}</Label>
              <Input
                id="password"
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
                registerMutation.isPending ||
                !email.trim() ||
                password.length < 8
              }
            >
              {registerMutation.isPending
                ? t("register.submitting")
                : t("register.submit")}
            </Button>

            <p className="text-muted-foreground text-center text-sm">
              {t("register.have_account")}{" "}
              <Link
                to="/auth/login"
                className="text-primary font-medium hover:underline"
              >
                {t("register.sign_in")}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
