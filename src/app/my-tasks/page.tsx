import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { computeProgress } from "@/lib/progress";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { DelayBadge } from "@/components/delay-badge";
import { ProgressBar } from "@/components/progress-bar";

export default async function MyTasksPage() {
  const session = await auth();
  if (!session?.user) return null;

  const where: Prisma.WorkOrderWhereInput =
    session.user.role === "DIV_HEAD" && session.user.divisionId
      ? {
          OR: [
            { assignedUserId: session.user.id },
            { assignedDivId: session.user.divisionId },
          ],
        }
      : { assignedUserId: session.user.id };

  const workOrders = await prisma.workOrder.findMany({
    where,
    include: {
      project: { select: { name: true } },
      createdBy: { select: { name: true } },
      children: { select: { id: true } },
    },
    orderBy: [{ priority: "asc" }, { status: "asc" }, { dueDate: "asc" }],
  });

  const projectIds = [...new Set(workOrders.map((wo) => wo.projectId))];
  const projectWorkOrders = projectIds.length
    ? await prisma.workOrder.findMany({
        where: { projectId: { in: projectIds } },
        select: { id: true, parentId: true, progress: true },
      })
    : [];
  const progressMap = computeProgress(projectWorkOrders);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900">내 업무</h1>
      <p className="mt-1 text-sm text-slate-500">
        나에게 할당된 업무 목록입니다. 상태/우선순위/진행률 변경은 업무를
        클릭해서 상세 화면에서 합니다.
      </p>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        {workOrders.length === 0 ? (
          <p className="text-sm text-slate-400">할당된 업무가 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {workOrders.map((wo) => {
              const hasChildren = wo.children.length > 0;
              const progress = hasChildren
                ? (progressMap.get(wo.id) ?? wo.progress)
                : wo.progress;
              return (
                <li
                  key={wo.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-slate-100 p-3 hover:border-blue-200"
                >
                  <div className="min-w-[200px] flex-1">
                    <Link
                      href={`/work-orders/${wo.id}`}
                      className="text-sm font-medium text-slate-800 hover:text-blue-600"
                    >
                      {wo.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-400">
                      지시: {wo.createdBy.name} · {wo.project.name}
                      {wo.dueDate &&
                        ` · 마감 ${wo.dueDate.toLocaleDateString("ko-KR")}`}
                    </p>
                  </div>
                  <StatusBadge status={wo.status} />
                  <PriorityBadge priority={wo.priority} />
                  <DelayBadge
                    dueDate={wo.dueDate}
                    status={wo.status}
                    completedAt={wo.completedAt}
                  />
                  <div className="w-36">
                    <ProgressBar value={progress} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
