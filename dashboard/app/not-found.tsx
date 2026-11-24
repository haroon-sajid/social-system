import Link from "next/link";
import { EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="py-10">
      <EmptyState icon="file" title="Page not found" description="This post or page does not exist, or it was deleted."
        action={<Link href="/posts" className="btn-primary">Back to posts</Link>} />
    </div>
  );
}
