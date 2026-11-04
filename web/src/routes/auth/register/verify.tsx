import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MailCheck } from "lucide-react";
import type { FormEvent } from "react";
import {
  useResendVerificationMutation,
  useVerifyRegistrationMutation,
} from "@/queries/registration";
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

export const Route = createFileRoute("/auth/register/verify")({
  validateSearch: (search: Record<string, unknown>): { email?: string } => ({
    email: (search.email as string) || undefined,
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { email } = Route.useSearch();
  const verifyMutation = useVerifyRegistrationMutation();
  const resendMutation = useResendVerificationMutation();

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  if (!email) {
    return (
      <div className="m-6 flex h-full items-center justify-center">
        <Card className="mx-auto w-full max-w-md">
          <CardHeader>
            <CardTitle>{t("register.verify.missing_email.title")}</CardTitle>
            <CardDescription>
              {t("register.verify.missing_email.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" asChild>
              <Link to="/auth/register">
                {t("register.verify.back_to_register")}
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
      const result = await verifyMutation.mutateAsync({
        email,
        code: code.trim(),
      });

      if (result.status === "active") {
        navigate({ to: "/auth/login" });
        return;
      }

      navigate({ to: "/pending-approval" });
    } catch (err) {
      setError(
        t(`errors.${(err as Error).message}`, {
          defaultValue: t("register.verify.error"),
        }),
      );
    }
  };

  const resend = async () => {
    setError(null);
    await resendMutation.mutateAsync(email).catch(() => undefined);
    // Same neutral wording as signup: the API never confirms whether an
    // address exists, so neither can we.
    setResent(true);
  };

  return (
    <div className="m-6 flex h-full items-center justify-center">
      <Card className="mx-auto w-full max-w-md">
        <CardHeader className="text-center">
          <div className="bg-primary/10 mx-auto mb-4 h-12 w-12 rounded-full p-3">
            <MailCheck className="text-primary h-6 w-6" />
          </div>
          <CardTitle>{t("register.verify.title")}</CardTitle>
          <CardDescription>
            {t("register.verify.subtitle", { email })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">{t("register.verify.code_label")}</Label>
              <Input
                id="code"
                // The challenge secret is 6 characters from [0-9A-Z]; accept
                // letters too and normalize the input to uppercase so a
                // lowercase-typed code still verifies.
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={6}
                value={code}
                onChange={(event) =>
                  setCode(
                    event.target.value
                      .replace(/[^0-9a-zA-Z]/g, "")
                      .toUpperCase(),
                  )
                }
                placeholder="······"
                className="text-center text-lg tracking-[0.5em]"
                disabled={verifyMutation.isPending}
              />
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}
            {resent && !error && (
              <p className="text-muted-foreground text-sm">
                {t("register.verify.resent")}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={verifyMutation.isPending || code.length !== 6}
            >
              {verifyMutation.isPending
                ? t("register.verify.submitting")
                : t("register.verify.submit")}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={resend}
              disabled={resendMutation.isPending}
            >
              {t("register.verify.resend")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
