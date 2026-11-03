import { createFileRoute } from "@tanstack/react-router";
import { BucketBrowser } from "@/components/public-catalog/BucketBrowser";

export const Route = createFileRoute("/b/$slug/")({
  component: BucketRoot,
});

function BucketRoot() {
  const { slug } = Route.useParams();

  return <BucketBrowser slug={slug} />;
}
