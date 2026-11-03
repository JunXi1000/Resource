import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * The numbers the quota page renders. `reserved_bytes` covers in-flight
 * presigned uploads and is *not* part of `used_bytes`, so the UI has to add
 * them together to show real headroom (see docs §13.5).
 */
export interface IUserUsage {
  quota_bytes: number;
  used_bytes: number;
  reserved_bytes: number;
  percent: number;
}

export const myUsageQueryOptions = () =>
  queryOptions({
    queryKey: ["users", "me", "usage"],
    queryFn: () => api.get<IUserUsage>("/users/me/usage"),
    staleTime: 30 * 1000,
  });
