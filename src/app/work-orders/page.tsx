import Link from "next/link";
import { auth } from "@/auth";
import { orgDb } from "@/lib/db";
import { allStoreKeys } from "@/lib/work-order-tree";
import { queryAllDivisions } from "@/lib/multi-division-query";
import { canManageWorkOrders, workOrderScopeWhere } from "@/lib/org-access";
import { BackToDashboard } from "@/components/back-to-dashboard";
import { WorkOrderGroupedList } from "@/components/work-order-grouped-list";

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string; div?: string }>;
}) {
  const { dept: deptFilter, div: divFilter } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  const canManage = canManageWorkOrders(session.user.role);

  const divisions = await orgDb.division.findMany({ select: { name: true } });
  const divisionKeys = allStoreKeys(divisions.map((d) => d.name));

  const results = await queryAllDivisions(divisionKeys, (client) =>
    client.workOrder.findMany({
      where: {
        AND: [workOrderScopeWhere(session.user), { status: { not: "COMPLETED" } }],
      },
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
            완료된 업무는{" "}
            <Link href="/work-orders/completed" className="text-blue-600 hover:underline">
              완료된 업무 보기
            </Link>
            에서 따로 확인할 수 있습니다.
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

      <WorkOrderGroupedList
        workOrders={workOrders}
        deptFilter={deptFilter}
        divFilter={divFilter}
      />
    </div>
  );
}
