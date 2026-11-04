import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { UserPlus } from "lucide-react";

import { AuthRegisterForm } from "@/components/auth-view/AuthRegisterForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/auth/register/")({
  component: RegisterPage,
});

function RegisterPage() {
  const { t } = useTranslation();

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
          <AuthRegisterForm />
        </CardContent>
      </Card>
    </div>
  );
}
