import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { canManageWorkOrders, workOrderScopeWhere } from "@/lib/org-access";
import { formatAssignee } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { DelayBadge } from "@/components/delay-badge";
import { TransferredBadge } from "@/components/transferred-badge";
import { ProgressBar } from "@/components/progress-bar";
import { BackToDashboard } from "@/components/back-to-dashboard";

export default async function WorkOrdersPage() {
  const session = await auth();
  if (!session?.user) return null;

  const canManage = canManageWorkOrders(session.user.role);

  const workOrders = await prisma.workOrder.findMany({
    where: workOrderScopeWhere(session.user),
    include: {
      project: { select: { name: true } },
      assignedDept: { select: { name: true } },
      assignedDiv: { select: { name: true } },
      assignedTeam: { select: { name: true } },
      assignedUser: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <BackToDashboard />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Work Order 목록
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            내 권한 범위에 해당하는 업무지시 목록입니다.
          </p>
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

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        {workOrders.length === 0 ? (
          <p className="text-sm text-slate-400">해당하는 업무가 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {workOrders.map((wo) => (
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
        )}
      </div>
    </div>
  );
}
