/**
 * Module-level bridge for opening the auth dialog from non-React contexts
 * (api.ts fetch handlers, route guards, deep event handlers). Kept free of
 * React imports so low-level modules can depend on it without cycles.
 */
export type PendingAction = () => void;

export interface IAuthDialogRequest {
  /** Where to navigate after a successful sign-in. */
  redirectTo?: string;
  /** Runs after a successful sign-in (e.g. resume a download). */
  onAuthed?: PendingAction;
  /** Which form to show first. Defaults to "login". */
  mode?: "login" | "register";
}

type OpenFn = (request: IAuthDialogRequest) => void;

let openFn: OpenFn | null = null;
let pendingAction: PendingAction | null = null;
// Requests made before the dialog mounts (e.g. route guards running in
// beforeLoad on a hard page load) queue up and replay on registration.
let queuedRequest: IAuthDialogRequest | null = null;
// After an intentional sign-out, in-flight queries fail with 401s whose
// handler would pop the dialog over the freshly signed-out guest view.
// Swallow those for a short window.
let suppressedUntil = 0;

export function suppressAuthDialog(ms = 2500): void {
  suppressedUntil = Date.now() + ms;
}

export function registerAuthDialogOpener(fn: OpenFn | null): void {
  openFn = fn;
  if (fn && queuedRequest) {
    const request = queuedRequest;
    queuedRequest = null;
    fn(request);
  }
}

export function requestAuthDialog(request: IAuthDialogRequest = {}): void {
  if (Date.now() < suppressedUntil) return;
  pendingAction = request.onAuthed ?? null;
  if (openFn) {
    openFn(request);
  } else {
    queuedRequest = request;
  }
}

/** Sign-in dialog remembering where to go (and what to do) afterwards. */
export function openAuthDialog(
  redirectTo?: string,
  onAuthed?: PendingAction,
): void {
  requestAuthDialog({ redirectTo, onAuthed, mode: "login" });
}

/** Registration variant of the dialog. */
export function openRegisterDialog(redirectTo?: string): void {
  requestAuthDialog({ redirectTo, mode: "register" });
}

/** Pops and clears the pending action after a successful sign-in. */
export function consumePendingAction(): PendingAction | null {
  const action = pendingAction;
  pendingAction = null;
  return action;
}

/** Drops the pending action when the dialog is dismissed. */
export function clearPendingAction(): void {
  pendingAction = null;
}
