import { useRouter } from "@tanstack/react-router";

import {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { LogIn, UserPlus } from "lucide-react";
import type { FC, ReactNode } from "react";
import type { IAuthDialogRequest } from "@/components/auth-view/auth-dialog-bus";
import { meQueryOptions } from "@/queries/me";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthLoginForm } from "@/components/auth-view/AuthLoginForm";
import { AuthRegisterForm } from "@/components/auth-view/AuthRegisterForm";
import {
  clearPendingAction,
  consumePendingAction,
  registerAuthDialogOpener,
  requestAuthDialog,
} from "@/components/auth-view/auth-dialog-bus";

/**
 * Sign-in / sign-up dialog for in-page actions (downloads, uploads,
 * creating buckets, gated pages). MUST be mounted inside the router tree —
 * the forms use router hooks, and a null router crashes React (the
 * blank-page bug).
 *
 * Everything else talks to the dialog through auth-dialog-bus so low-level
 * modules (api.ts, route guards) can open it without React context. These
 * re-exports keep the familiar call sites working.
 */
export const openAuthDialog = (redirectTo?: string, onAuthed?: () => void) =>
  requestAuthDialog({ redirectTo, onAuthed, mode: "login" });

export const openRegisterDialog = (redirectTo?: string) =>
  requestAuthDialog({ redirectTo, mode: "register" });

interface IAuthDialogContext {
  openAuthDialog: typeof openAuthDialog;
  openRegisterDialog: typeof openRegisterDialog;
}

const AuthDialogContext = createContext<IAuthDialogContext>({
  openAuthDialog: () => {},
  openRegisterDialog: () => {},
});

export function useAuthDialog(): IAuthDialogContext {
  return useContext(AuthDialogContext);
}

export const AuthDialog: FC<{ children: ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const redirectToRef = useRef<string | undefined>(undefined);

  const openDialog = useCallback((request: IAuthDialogRequest) => {
    redirectToRef.current = request.redirectTo;
    setMode(request.mode ?? "login");
    setIsOpen(true);
  }, []);

  // Register the bridge for non-React callers.
  registerAuthDialogOpener(openDialog);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    // Dismissing the dialog must not leave a stale action behind.
    if (!open) clearPendingAction();
  }, []);

  const handleSuccess = useCallback(() => {
    setIsOpen(false);

    void (async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      const session = await queryClient.fetchQuery(meQueryOptions());
      router.update({ context: { queryClient, session } });

      const target = redirectToRef.current;
      if (target && target !== router.state.location.href) {
        await router.navigate({ href: target });
      } else {
        await router.invalidate();
      }

      // Resume the action that triggered the dialog (e.g. the download).
      consumePendingAction()?.();
    })();
  }, [queryClient, router]);

  const handleRegistered = useCallback(
    (email: string) => {
      setIsOpen(false);
      void router.navigate({
        to: "/auth/register/verify",
        search: { email },
      });
    },
    [router],
  );

  const contextValue = useMemo(
    () => ({ openAuthDialog, openRegisterDialog }),
    [],
  );

  return (
    <AuthDialogContext.Provider value={contextValue}>
      {children}
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        {/* Stable seed: the sheet ink (torn edge + close mark) is generated
            once and served from the ink cache on every later open/mode switch. */}
        <DialogContent className="sm:max-w-md" seed="auth-dialog">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-info/10">
              {mode === "login" ? (
                <LogIn className="h-6 w-6 text-info" />
              ) : (
                <UserPlus className="h-6 w-6 text-info" />
              )}
            </div>
            <DialogTitle className="text-center">
              {mode === "login"
                ? t("auth.sign_in_title")
                : t("register.title")}
            </DialogTitle>
            <DialogDescription className="text-center">
              {mode === "login"
                ? t("auth.sign_in_subtitle")
                : t("register.subtitle")}
            </DialogDescription>
          </DialogHeader>
          <Suspense
            fallback={
              <div className="space-y-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            }
          >
            {mode === "login" ? (
              <AuthLoginForm
                redirect={redirectToRef.current}
                onSuccess={handleSuccess}
                onSwitchToRegister={() => setMode("register")}
              />
            ) : (
              <AuthRegisterForm
                onSuccess={handleRegistered}
                onSwitchToLogin={() => setMode("login")}
              />
            )}
          </Suspense>
        </DialogContent>
      </Dialog>
    </AuthDialogContext.Provider>
  );
};
