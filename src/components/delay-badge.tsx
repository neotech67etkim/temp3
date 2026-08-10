import type { WorkOrderStatus } from "@prisma/client";
import { isOverdue } from "@/lib/delay";

export function DelayBadge({
  dueDate,
  status,
  completedAt,
}: {
  dueDate: Date | null;
  status: WorkOrderStatus;
  completedAt: Date | null;
}) {
  if (!isOverdue({ dueDate, status, completedAt })) return null;

  return (
    <span className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
      지연
    </span>
  );
}
