import type { WorkOrderStatus } from "@prisma/client";

export const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  NOT_STARTED: "시작전",
  IN_PROGRESS: "진행중",
  ON_HOLD: "보류",
  COMPLETED: "완료",
  CANCELLED: "취소",
};

const STATUS_CLASS: Record<WorkOrderStatus, string> = {
  NOT_STARTED: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  ON_HOLD: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: WorkOrderStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
