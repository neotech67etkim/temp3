import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatAssignee } from "@/lib/format";
import { isOverdue } from "@/lib/delay";

export const GANTT_UNASSIGNED_GROUP = "미지정";
export const GANTT_DEPT_WIDE_GROUP = "부서 공통";

export type GanttItem = {
  id: string;
  title: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "CANCELLED";
  dueDate: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  progress: number;
  assignee: string;
  overdue: boolean;
  divisionName: string;
};

export async function getGanttItems(scope: {
  departmentId?: string;
  divisionId?: string;
}): Promise<GanttItem[]> {
  let where: Prisma.WorkOrderWhereInput = {};

  if (scope.divisionId) {
    where = {
      OR: [
        { assignedDivId: scope.divisionId },
        { assignedTeam: { divisionId: scope.divisionId } },
        { assignedUser: { divisionId: scope.divisionId } },
      ],
    };
  } else if (scope.departmentId) {
    where = {
      OR: [
        { assignedDeptId: scope.departmentId },
        { assignedDiv: { departmentId: scope.departmentId } },
        { assignedTeam: { division: { departmentId: scope.departmentId } } },
        { assignedUser: { departmentId: scope.departmentId } },
      ],
    };
  }

  const workOrders = await prisma.workOrder.findMany({
    where,
    include: {
      assignedDept: { select: { name: true } },
      assignedDiv: { select: { name: true } },
      assignedTeam: { select: { name: true, division: { select: { name: true } } } },
      assignedUser: { select: { name: true, division: { select: { name: true } } } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  return workOrders.map((wo) => ({
    id: wo.id,
    title: wo.title,
    status: wo.status,
    dueDate: wo.dueDate,
    completedAt: wo.completedAt,
    createdAt: wo.createdAt,
    progress: wo.progress,
    assignee: formatAssignee(wo),
    overdue: isOverdue(wo),
    divisionName:
      wo.assignedDiv?.name ??
      wo.assignedTeam?.division.name ??
      wo.assignedUser?.division?.name ??
      (wo.assignedDept ? GANTT_DEPT_WIDE_GROUP : GANTT_UNASSIGNED_GROUP),
  }));
}

export function daysBetween(a: Date, b: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
