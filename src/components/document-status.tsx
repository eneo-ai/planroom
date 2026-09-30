import { Badge } from "@astryxdesign/core/Badge";
import type { DocumentStatus } from "@/contracts";
import { statuses } from "@/client/document-format";

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const variant =
    status === "active" ? "blue" : status === "completed" ? "teal" : "neutral";
  return <Badge label={statuses[status]} variant={variant} />;
}
