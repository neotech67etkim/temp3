import type { WorkOrderStatus } from "@prisma/client";

export type DelayCheckable = {
  dueDate: Date | null;
  status: WorkOrderStatus;
  completedAt: Date | null;
};

/**
 * 완료된 업무는 실제 완료일이 지시받은 완료일(dueDate)을 넘겼는지로,
 * 진행 중인 업무는 오늘이 dueDate를 넘겼는지로 지연 여부를 판단한다.
 */
export function isOverdue(wo: DelayCheckable): boolean {
  if (!wo.dueDate || wo.status === "CANCELLED") return false;
  if (wo.status === "COMPLETED") {
    return !!wo.completedAt && wo.completedAt > wo.dueDate;
  }
  return new Date() > wo.dueDate;
}
