import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type {
  IPage,
  IPublicBucket,
  IPublicBucketQuery,
  IPublicCategory,
  IPublicDownload,
  IPublicFileListing,
} from "@/types/public-catalog";
import { publicFetch } from "@/lib/public-api";

const PUBLIC_PAGE_SIZE = 24;

export const publicCategoriesQueryOptions = () =>
  queryOptions({
    queryKey: ["public", "categories"],
    queryFn: () => publicFetch<IPage<IPublicCategory>>("/public/categories"),
    select: (data) => data.data,
    staleTime: 5 * 60 * 1000,
  });

export const publicBucketsQueryOptions = (filters: IPublicBucketQuery) =>
  queryOptions({
    queryKey: ["public", "buckets", filters],
    queryFn: () =>
      publicFetch<IPage<IPublicBucket>>("/public/buckets", {
        params: { ...filters, limit: PUBLIC_PAGE_SIZE },
      }),
    select: (data) => data.data,
    staleTime: 60 * 1000,
  });

export const publicBucketsInfiniteQueryOptions = (
  filters: IPublicBucketQuery,
) =>
  infiniteQueryOptions({
    queryKey: ["public", "buckets", "infinite", filters],
    queryFn: ({ pageParam }) =>
      publicFetch<IPage<IPublicBucket>>("/public/buckets", {
        params: {
          ...filters,
          limit: PUBLIC_PAGE_SIZE,
          cursor: pageParam ?? undefined,
        },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 60 * 1000,
  });

export const publicBucketQueryOptions = (slug: string) =>
  queryOptions({
    queryKey: ["public", "bucket", slug],
    queryFn: () => publicFetch<IPublicBucket>(`/public/buckets/${slug}`),
    staleTime: 60 * 1000,
  });

export const publicFilesInfiniteQueryOptions = (
  slug: string,
  folderId: string | undefined,
  query: string,
) =>
  infiniteQueryOptions({
    queryKey: ["public", "bucket", slug, "files", folderId ?? null, query],
    queryFn: ({ pageParam }) =>
      publicFetch<IPublicFileListing>(`/public/buckets/${slug}/files`, {
        params: {
          folder: folderId,
          q: query,
          limit: 100,
          cursor: pageParam ?? undefined,
        },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 60 * 1000,
  });

/**
 * Downloads are resolved on demand: the presigned URL lives for minutes, so it
 * must never be cached in the query cache where it would go stale silently.
 */
export async function resolvePublicDownload(fileId: string) {
  const download = await publicFetch<IPublicDownload>(
    `/public/files/${fileId}/url`,
  );
  return download;
}

export const publicDownloadUrl = (fileId: string) =>
  publicFetch<IPublicDownload>(`/public/files/${fileId}/url`);
