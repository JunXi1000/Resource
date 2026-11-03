import { createFileRoute } from "@tanstack/react-router";
import { BucketBrowser } from "@/components/public-catalog/BucketBrowser";

export const Route = createFileRoute("/b/$slug/f/{-$folderId}")({
  component: BucketFolder,
});

function BucketFolder() {
  const { slug, folderId } = Route.useParams();

  return <BucketBrowser slug={slug} folderId={folderId} />;
}
