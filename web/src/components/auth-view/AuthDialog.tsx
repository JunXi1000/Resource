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
import { LogIn } from "lucide-react";
import type { FC, ReactNode } from "react";
import { meQueryOptions } from "@/queries/me";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthLoginForm } from "@/components/auth-view/AuthLoginForm";

/**
 * Sign-in dialog for in-page actions (downloads, uploads, creating buckets,
 * gated pages). MUST be mounted inside the router tree — the login form
 * uses router hooks, and a null router crashes React (the blank-page bug).
 *
 * The module-level bridge lets non-hook callers (event handlers deep in a
 * component tree, route guards) open the dialog without prop drilling.
 */
type OpenAuthDialog = (redirectTo?: string) => void;
let busOpenFn: OpenAuthDialog | null = null;

export function openAuthDialog(redirectTo?: string): void {
  busOpenFn?.(redirectTo);
}

interface IAuthDialogContext {
  openAuthDialog: OpenAuthDialog;
}

const AuthDialogContext = createContext<IAuthDialogContext>({
  openAuthDialog: () => {},
});

export function useAuthDialog(): IAuthDialogContext {
  return useContext(AuthDialogContext);
}

export const AuthDialog: FC<{ children: ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const redirectToRef = useRef<string | undefined>(undefined);

  const openDialog = useCallback((redirectTo?: string) => {
    redirectToRef.current = redirectTo;
    setIsOpen(true);
  }, []);

  // Register the bridge for non-hook callers.
  busOpenFn = openDialog;

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
    })();
  }, [queryClient, router]);

  const contextValue = useMemo(() => ({ openAuthDialog: openDialog }), [openDialog]);

  return (
    <AuthDialogContext.Provider value={contextValue}>
      {children}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-info/10">
              <LogIn className="h-6 w-6 text-info" />
            </div>
            <DialogTitle className="text-center">
              {t("auth.sign_in_title")}
            </DialogTitle>
            <DialogDescription className="text-center">
              {t("auth.sign_in_subtitle")}
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
            <AuthLoginForm
              redirect={redirectToRef.current}
              onSuccess={handleSuccess}
            />
          </Suspense>
        </DialogContent>
      </Dialog>
    </AuthDialogContext.Provider>
  );
};
