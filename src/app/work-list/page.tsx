import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { computeProgress } from "@/lib/progress";
import { formatAssignee } from "@/lib/format";
import { canManageWorkOrders, myWorkListWhere } from "@/lib/org-access";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { DelayBadge } from "@/components/delay-badge";
import { TransferredBadge } from "@/components/transferred-badge";
import { ProgressBar } from "@/components/progress-bar";
import { MyTodoForm } from "@/components/my-todo-form";
import { BackToDashboard } from "@/components/back-to-dashboard";

export default async function WorkListPage() {
  const session = await auth();
  if (!session?.user) return null;

  const canDelegate = canManageWorkOrders(session.user.role);
  const where = myWorkListWhere(session.user);

  const [projects, items] = await Promise.all([
    prisma.project.findMany({ orderBy: { name: "asc" } }),
    prisma.workOrder.findMany({
      where,
      include: {
        project: { select: { name: true } },
        createdBy: { select: { name: true } },
        assignedDept: { select: { name: true } },
        assignedDiv: { select: { name: true } },
        assignedTeam: { select: { name: true } },
        assignedUser: { select: { name: true } },
        children: { select: { id: true } },
      },
      orderBy: [{ status: "asc" }, { priority: "asc" }, { dueDate: "asc" }],
    }),
  ]);

  const projectIds = [...new Set(items.map((t) => t.projectId))];
  const projectWorkOrders = projectIds.length
    ? await prisma.workOrder.findMany({
        where: { projectId: { in: projectIds } },
        select: { id: true, parentId: true, progress: true },
      })
    : [];
  const progressMap = computeProgress(projectWorkOrders);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <BackToDashboard />
      <h1 className="text-xl font-semibold text-slate-900">업무리스트</h1>
      <p className="mt-1 text-sm text-slate-500">
        나에게 지시된 업무와 직접 만든 할일을 함께 관리합니다. 각 업무의 지시자
        · 이관 여부 · 담당을 확인할 수 있습니다.
      </p>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <MyTodoForm projects={projects} />
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        {items.length === 0 ? (
          <p className="text-sm text-slate-400">표시할 업무가 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const hasChildren = item.children.length > 0;
              const progress = hasChildren
                ? (progressMap.get(item.id) ?? item.progress)
                : item.progress;
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-slate-100 p-3 hover:border-blue-200"
                >
                  <div className="min-w-[220px] flex-1">
                    <Link
                      href={`/work-orders/${item.id}`}
                      className="text-sm font-medium text-slate-800 hover:text-blue-600"
                    >
                      {item.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {item.project.name} · 지시: {item.createdBy.name} · 담당:{" "}
                      {formatAssignee(item)}
                      {item.dueDate &&
                        ` · 마감 ${item.dueDate.toLocaleDateString("ko-KR")}`}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                  <PriorityBadge priority={item.priority} />
                  <TransferredBadge transferred={item.transferred} />
                  <DelayBadge
                    dueDate={item.dueDate}
                    status={item.status}
                    completedAt={item.completedAt}
                  />
                  <div className="w-32">
                    <ProgressBar value={progress} />
                  </div>
                  {canDelegate && (
                    <Link
                      href={`/work-orders/new?projectId=${item.projectId}&parentId=${item.id}`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      + 하위 업무로 위임
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
