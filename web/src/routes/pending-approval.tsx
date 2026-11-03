import { Link, createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/pending-approval")({
  component: PendingApprovalPage,
});

function PendingApprovalPage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="bg-info/10 mx-auto mb-4 h-12 w-12 rounded-full p-3">
            <Clock className="text-info h-6 w-6" />
          </div>
          <CardTitle>{t("pending_approval.title")}</CardTitle>
          <CardDescription>{t("pending_approval.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button className="w-full" asChild>
            <Link to="/">{t("pending_approval.back_to_catalog")}</Link>
          </Button>
          <Button variant="ghost" className="w-full" asChild>
            <Link to="/auth/login">{t("pending_approval.back_to_login")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
