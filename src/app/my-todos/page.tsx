import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { computeProgress } from "@/lib/progress";
import { canManageWorkOrders } from "@/lib/org-access";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { DelayBadge } from "@/components/delay-badge";
import { ProgressBar } from "@/components/progress-bar";
import { MyTodoForm } from "@/components/my-todo-form";

export default async function MyTodosPage() {
  const session = await auth();
  if (!session?.user) return null;

  const canDelegate = canManageWorkOrders(session.user.role);

  const [projects, todos] = await Promise.all([
    prisma.project.findMany({ orderBy: { name: "asc" } }),
    prisma.workOrder.findMany({
      where: { createdById: session.user.id, assignedUserId: session.user.id },
      include: {
        project: { select: { name: true } },
        children: { select: { id: true } },
      },
      orderBy: [{ status: "asc" }, { priority: "asc" }, { dueDate: "asc" }],
    }),
  ]);

  const projectIds = [...new Set(todos.map((t) => t.projectId))];
  const projectWorkOrders = projectIds.length
    ? await prisma.workOrder.findMany({
        where: { projectId: { in: projectIds } },
        select: { id: true, parentId: true, progress: true },
      })
    : [];
  const progressMap = computeProgress(projectWorkOrders);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900">내 할일</h1>
      <p className="mt-1 text-sm text-slate-500">
        직접 만들어 스스로 관리하는 할 일 목록입니다. 다른 사람에게 지시받은
        업무는 &quot;내 업무&quot;에서 확인하세요.
        {canDelegate &&
          " 할 일을 진행하다가 하위 업무로 쪼개어 부서/과원에게 할당할 수 있습니다."}
      </p>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <MyTodoForm projects={projects} />
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        {todos.length === 0 ? (
          <p className="text-sm text-slate-400">등록된 할 일이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {todos.map((todo) => {
              const hasChildren = todo.children.length > 0;
              const progress = hasChildren
                ? (progressMap.get(todo.id) ?? todo.progress)
                : todo.progress;
              return (
                <li
                  key={todo.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-slate-100 p-3 hover:border-blue-200"
                >
                  <div className="min-w-[200px] flex-1">
                    <Link
                      href={`/work-orders/${todo.id}`}
                      className="text-sm font-medium text-slate-800 hover:text-blue-600"
                    >
                      {todo.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {todo.project.name}
                      {todo.dueDate &&
                        ` · 마감 ${todo.dueDate.toLocaleDateString("ko-KR")}`}
                    </p>
                  </div>
                  <StatusBadge status={todo.status} />
                  <PriorityBadge priority={todo.priority} />
                  <DelayBadge
                    dueDate={todo.dueDate}
                    status={todo.status}
                    completedAt={todo.completedAt}
                  />
                  <div className="w-32">
                    <ProgressBar value={progress} />
                  </div>
                  {canDelegate && (
                    <Link
                      href={`/work-orders/new?projectId=${todo.projectId}&parentId=${todo.id}`}
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
