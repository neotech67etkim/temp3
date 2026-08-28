import type { Prisma } from "@prisma/client";
import { orgDb } from "@/lib/db";
import { DEPT_COMMON_KEY } from "@/lib/work-order-tree";
import { queryAllDivisions } from "@/lib/multi-division-query";
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
  let storeKeys: string[];

  if (scope.divisionId) {
    const division = await orgDb.division.findUnique({
      where: { id: scope.divisionId },
      select: { name: true },
    });
    if (!division) return [];
    where = {
      OR: [
        { assignedDivId: scope.divisionId },
        { assignedTeam: { divisionId: scope.divisionId } },
        { assignedUser: { divisionId: scope.divisionId } },
      ],
    };
    // 특정 과로 배정된 업무는 그 과 파일에만 저장되므로 해당 파일 하나만 보면 된다.
    storeKeys = [division.name];
  } else if (scope.departmentId) {
    const divisions = await orgDb.division.findMany({
      where: { departmentId: scope.departmentId },
      select: { name: true },
    });
    where = {
      OR: [
        { assignedDeptId: scope.departmentId },
        { assignedDiv: { departmentId: scope.departmentId } },
        { assignedTeam: { division: { departmentId: scope.departmentId } } },
        { assignedUser: { departmentId: scope.departmentId } },
      ],
    };
    // 부서 전체 보기: 부서 공통 파일 + 소속된 모든 과 파일을 함께 훑는다.
    storeKeys = [DEPT_COMMON_KEY, ...divisions.map((d) => d.name)];
  } else {
    return [];
  }

  const results = await queryAllDivisions(storeKeys, (client) =>
    client.workOrder.findMany({
      where,
      include: {
        assignedDept: { select: { name: true } },
        assignedDiv: { select: { name: true } },
        assignedTeam: { select: { name: true, division: { select: { name: true } } } },
        assignedUser: { select: { name: true, division: { select: { name: true } } } },
      },
    }),
  );

  const workOrders = results
    .flatMap((r) => r.value)
    .sort((a, b) => {
      const aDue = a.dueDate?.getTime() ?? Infinity;
      const bDue = b.dueDate?.getTime() ?? Infinity;
      if (aDue !== bDue) return aDue - bDue;
      return a.createdAt.getTime() - b.createdAt.getTime();
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
