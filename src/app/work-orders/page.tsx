import Link from "next/link";
import { auth } from "@/auth";
import { orgDb } from "@/lib/db";
import { getNasStore, getMigrationsDir } from "@/lib/app-config";
import { allStoreKeys } from "@/lib/work-order-tree";
import { queryAllDivisions } from "@/lib/multi-division-query";
import { canManageWorkOrders, workOrderScopeWhere } from "@/lib/org-access";
import { formatAssignee } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { DelayBadge } from "@/components/delay-badge";
import { TransferredBadge } from "@/components/transferred-badge";
import { ProgressBar } from "@/components/progress-bar";
import { BackToDashboard } from "@/components/back-to-dashboard";

const UNASSIGNED_GROUP = "미지정";
const DEPT_WIDE_GROUP = "부서 공통";

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string; div?: string }>;
}) {
  const { dept: deptFilter, div: divFilter } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  const canManage = canManageWorkOrders(session.user.role);

  const store = getNasStore();
  const migrationsDir = getMigrationsDir();
  const divisions = await orgDb.division.findMany({ select: { name: true } });
  const divisionKeys = allStoreKeys(divisions.map((d) => d.name));

  const results = await queryAllDivisions(store, divisionKeys, migrationsDir, (client) =>
    client.workOrder.findMany({
      where: workOrderScopeWhere(session.user),
      include: {
        project: { select: { name: true } },
        assignedDept: { select: { name: true } },
        assignedDiv: {
          select: { name: true, department: { select: { name: true } } },
        },
        assignedTeam: {
          select: {
            name: true,
            division: {
              select: { name: true, department: { select: { name: true } } },
            },
          },
        },
        assignedUser: {
          select: {
            name: true,
            department: { select: { name: true } },
            division: {
              select: { name: true, department: { select: { name: true } } },
            },
          },
        },
        createdBy: { select: { name: true } },
      },
    }),
  );

  const workOrders = results
    .flatMap((r) => r.value)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority.localeCompare(b.priority);
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .slice(0, 100);

  function resolveGroup(wo: (typeof workOrders)[number]) {
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

  const groups = new Map<string, Map<string, typeof workOrders>>();
  for (const wo of workOrders) {
    const { dept, div } = resolveGroup(wo);
    if (!groups.has(dept)) groups.set(dept, new Map());
    const deptGroup = groups.get(dept)!;
    if (!deptGroup.has(div)) deptGroup.set(div, []);
    deptGroup.get(div)!.push(wo);
  }
  const sortedDepts = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  // 대시보드의 "과별 진행현황"에서 부서/과를 클릭하면 여기로 넘어온다 -
  // 부서만 지정하면 그 부서의 모든 과, 과까지 지정하면 그 과만 남긴다.
  const visibleDepts = deptFilter
    ? sortedDepts.filter((d) => d === deptFilter)
    : sortedDepts;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <BackToDashboard />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Work Order 목록
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            내 권한 범위에 해당하는 업무지시를 과 단위로 묶어서 보여줍니다.
          </p>
          {(deptFilter || divFilter) && (
            <p className="mt-2 text-xs text-slate-500">
              필터: <strong>{divFilter ?? deptFilter}</strong>{" "}
              <Link href="/work-orders" className="text-blue-600 hover:underline">
                전체 보기
              </Link>
            </p>
          )}
        </div>
        {canManage && (
          <Link
            href="/work-orders/new"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + 새 업무 할당
          </Link>
        )}
      </div>

      {workOrders.length === 0 || visibleDepts.length === 0 ? (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-400">해당하는 업무가 없습니다.</p>
        </div>
      ) : (
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
      )}
    </div>
  );
}
