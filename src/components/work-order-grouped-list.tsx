import Link from "next/link";
import type { Priority, WorkOrderStatus } from "@prisma/client";
import { formatAssignee, type AssigneeInfo } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { DelayBadge } from "@/components/delay-badge";
import { TransferredBadge } from "@/components/transferred-badge";
import { ProgressBar } from "@/components/progress-bar";

const UNASSIGNED_GROUP = "미지정";
const DEPT_WIDE_GROUP = "부서 공통";

export type GroupableWorkOrder = AssigneeInfo & {
  id: string;
  title: string;
  status: WorkOrderStatus;
  priority: Priority;
  transferred: boolean;
  dueDate: Date | null;
  completedAt: Date | null;
  progress: number;
  project: { name: string };
  createdBy: { name: string };
  assignedDept?: { name: string } | null;
  assignedDiv?: { name: string; department: { name: string } } | null;
  assignedTeam?: {
    name: string;
    division: { name: string; department: { name: string } };
  } | null;
  assignedUser?: {
    name: string;
    department: { name: string } | null;
    division: { name: string; department: { name: string } } | null;
  } | null;
};

function resolveGroup(wo: GroupableWorkOrder) {
  if (wo.assignedDiv) {
    return { dept: wo.assignedDiv.department.name, div: wo.assignedDiv.name };
  }
  if (wo.assignedTeam) {
    return {
      dept: wo.assignedTeam.division.department.name,
      div: wo.assignedTeam.division.name,
    };
  }
  if (wo.assignedUser?.division) {
    return {
      dept: wo.assignedUser.division.department.name,
      div: wo.assignedUser.division.name,
    };
  }
  if (wo.assignedUser?.department) {
    return { dept: wo.assignedUser.department.name, div: DEPT_WIDE_GROUP };
  }
  if (wo.assignedDept) {
    return { dept: wo.assignedDept.name, div: DEPT_WIDE_GROUP };
  }
  return { dept: UNASSIGNED_GROUP, div: UNASSIGNED_GROUP };
}

/**
 * /work-orders와 /work-orders/completed가 공유하는 부서/과별 그룹 렌더링.
 * 정렬은 각 페이지가 쿼리 시점에 끝내서 넘기고, 여기서는 그룹핑/렌더링만 한다.
 */
export function WorkOrderGroupedList({
  workOrders,
  deptFilter,
  divFilter,
}: {
  workOrders: GroupableWorkOrder[];
  deptFilter?: string;
  divFilter?: string;
}) {
  const groups = new Map<string, Map<string, GroupableWorkOrder[]>>();
  for (const wo of workOrders) {
    const { dept, div } = resolveGroup(wo);
    if (!groups.has(dept)) groups.set(dept, new Map());
    const deptGroup = groups.get(dept)!;
    if (!deptGroup.has(div)) deptGroup.set(div, []);
    deptGroup.get(div)!.push(wo);
  }
  const sortedDepts = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  const visibleDepts = deptFilter
    ? sortedDepts.filter((d) => d === deptFilter)
    : sortedDepts;

  if (workOrders.length === 0 || visibleDepts.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-400">해당하는 업무가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      {visibleDepts.map((dept) => {
        const deptGroup = groups.get(dept)!;
        const sortedDivs = (divFilter
          ? [...deptGroup.keys()].filter((d) => d === divFilter)
          : [...deptGroup.keys()]
        ).sort((a, b) => a.localeCompare(b));
        return (
          <div key={dept}>
            <h2 className="mb-2 text-sm font-semibold text-slate-800">
              {dept}
            </h2>
            <div className="flex flex-col gap-4">
              {sortedDivs.map((div) => (
                <div
                  key={div}
                  className="rounded-lg border border-slate-200 bg-white p-5"
                >
                  <h3 className="mb-3 text-xs font-semibold text-slate-500">
                    {div}
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {deptGroup.get(div)!.map((wo) => (
                      <li
                        key={wo.id}
                        className="flex flex-wrap items-center gap-3 rounded-md border border-slate-100 p-3 hover:border-blue-200"
                      >
                        <Link
                          href={`/work-orders/${wo.id}`}
                          className="min-w-[180px] flex-1 text-sm font-medium text-slate-800 hover:text-blue-600"
                        >
                          {wo.title}
                        </Link>
                        <span className="text-xs text-slate-400">
                          {wo.project.name}
                        </span>
                        <StatusBadge status={wo.status} />
                        <PriorityBadge priority={wo.priority} />
                        <TransferredBadge transferred={wo.transferred} />
                        <DelayBadge
                          dueDate={wo.dueDate}
                          status={wo.status}
                          completedAt={wo.completedAt}
                        />
                        <span className="text-xs text-slate-400">
                          {wo.createdBy.name} → {formatAssignee(wo)}
                        </span>
                        <div className="w-36">
                          <ProgressBar value={wo.progress} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
