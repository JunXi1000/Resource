import { getApiUrl } from "@/hooks/useConfig";

/**
 * Anonymous fetch for the public catalog and the signup flow.
 *
 * The authenticated helper in lib/api.ts reacts to 403 by refreshing tokens and
 * bouncing to the login page. Neither is acceptable here: a visitor browsing
 * the catalog must never be redirected because of a failed request, and a
 * disabled feature has to surface as a plain error the page can render.
 */
export type PublicQueryParams = Record<
  string,
  string | number | boolean | undefined | null
>;

type PublicRequestOptions = {
  method?: string;
  body?: object;
  params?: PublicQueryParams;
};

export async function publicFetch<T>(
  path: string,
  options: PublicRequestOptions = {},
): Promise<T> {
  const { method = "GET", body, params } = options;

  const url = new URL(`${getApiUrl()}${path}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(key, String(value));
    });
  }

  const response = await fetch(url.toString(), {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let code = "INTERNAL_SERVER_ERROR";
    try {
      const payload = (await response.json()) as { error?: Array<string> };
      code = payload.error?.[0] ?? code;
    } catch {
      // A non-JSON error body is still an error; keep the generic code.
    }
    throw new Error(code);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}
