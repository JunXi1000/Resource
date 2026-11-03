import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface ICatalogPublishPayload {
  name: string;
  is_public: boolean;
  slug: string;
  category: string;
  tags: Array<string>;
}

/**
 * Publishes or hides a bucket in the anonymous catalog.
 *
 * `name` is part of the payload even though this screen never edits it: the
 * update endpoint validates it as required, so omitting it would fail with a
 * field error that has nothing to do with publishing.
 */
export const useCatalogPublish = (bucketId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ICatalogPublishPayload) =>
      api.patch(`/buckets/${bucketId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buckets"] });
      // The catalog is a separate cache (anonymous queries); a freshly
      // published bucket has to show up without a manual reload.
      queryClient.invalidateQueries({ queryKey: ["public"] });
    },
  });
};
