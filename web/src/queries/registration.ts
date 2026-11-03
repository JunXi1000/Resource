import { useMutation } from "@tanstack/react-query";
import { publicFetch } from "@/lib/public-api";

export type RegistrationState =
  "pending_verification" | "pending_approval" | "active";

export interface IRegistrationResponse {
  status: RegistrationState;
}

export interface IRegistrationBody {
  first_name?: string;
  last_name?: string;
  email: string;
  password: string;
}

export interface IVerifyBody {
  email: string;
  code: string;
}

/**
 * Signup always answers 202 with the same shape, whether or not the address is
 * already taken. The UI must therefore speak in conditionals ("if this address
 * can register, you will receive an email") rather than claiming delivery.
 */
export const useRegisterMutation = () =>
  useMutation({
    mutationFn: (body: IRegistrationBody) =>
      publicFetch<IRegistrationResponse>("/auth/register", {
        method: "POST",
        body,
      }),
  });

export const useVerifyRegistrationMutation = () =>
  useMutation({
    mutationFn: (body: IVerifyBody) =>
      publicFetch<IRegistrationResponse>("/auth/register/verify", {
        method: "POST",
        body,
      }),
  });

export const useResendVerificationMutation = () =>
  useMutation({
    mutationFn: (email: string) =>
      publicFetch<IRegistrationResponse>("/auth/register/resend", {
        method: "POST",
        body: { email },
      }),
  });
