import Link from "next/link";
import { auth } from "@/auth";
import { orgDb } from "@/lib/db";
import { getNasStore, getMigrationsDir } from "@/lib/app-config";
import { allStoreKeys } from "@/lib/work-order-tree";
import { queryAllDivisions } from "@/lib/multi-division-query";
import { workOrderScopeWhere } from "@/lib/org-access";
import { BackToDashboard } from "@/components/back-to-dashboard";
import { WorkOrderGroupedList } from "@/components/work-order-grouped-list";

export default async function CompletedWorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string; div?: string }>;
}) {
  const { dept: deptFilter, div: divFilter } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  const store = getNasStore();
  const migrationsDir = getMigrationsDir();
  const divisions = await orgDb.division.findMany({ select: { name: true } });
  const divisionKeys = allStoreKeys(divisions.map((d) => d.name));

  const results = await queryAllDivisions(store, divisionKeys, migrationsDir, (client) =>
    client.workOrder.findMany({
      where: {
        AND: [workOrderScopeWhere(session.user), { status: "COMPLETED" }],
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
      const aDone = a.completedAt?.getTime() ?? a.createdAt.getTime();
      const bDone = b.completedAt?.getTime() ?? b.createdAt.getTime();
      return bDone - aDone;
    })
    .slice(0, 100);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <BackToDashboard />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">완료된 업무</h1>
          <p className="mt-1 text-sm text-slate-500">
            완료 처리된 업무만 모아서 보여줍니다.{" "}
            <Link href="/work-orders" className="text-blue-600 hover:underline">
              진행 중인 업무 보기
            </Link>
          </p>
          {(deptFilter || divFilter) && (
            <p className="mt-2 text-xs text-slate-500">
              필터: <strong>{divFilter ?? deptFilter}</strong>{" "}
              <Link href="/work-orders/completed" className="text-blue-600 hover:underline">
                전체 보기
              </Link>
            </p>
          )}
        </div>
      </div>

      <WorkOrderGroupedList
        workOrders={workOrders}
        deptFilter={deptFilter}
        divFilter={divFilter}
      />
    </div>
  );
}
