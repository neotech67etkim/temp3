import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getCategoryProgress, getOrgProgressTree } from "@/lib/dashboard";
import { computeProgress } from "@/lib/progress";
import { ProgressBar } from "@/components/progress-bar";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { DelayBadge } from "@/components/delay-badge";
import { CategoryProgressChart } from "@/components/category-progress-chart";
import { StatusPieChart } from "@/components/status-pie-chart";
import { MyTodoForm } from "@/components/my-todo-form";

const MY_TODOS_PREVIEW_LIMIT = 5;

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await auth();

  const [categories, orgTree, projects, myTodos] = await Promise.all([
    getCategoryProgress(),
    getOrgProgressTree(),
    session?.user
      ? prisma.project.findMany({ orderBy: { name: "asc" } })
      : Promise.resolve([]),
    session?.user
      ? prisma.workOrder.findMany({
          where: {
            createdById: session.user.id,
            assignedUserId: session.user.id,
          },
          include: {
            project: { select: { name: true } },
            children: { select: { id: true } },
          },
          orderBy: [{ status: "asc" }, { priority: "asc" }, { dueDate: "asc" }],
        })
      : Promise.resolve([]),
  ]);

  const myTodosProjectIds = [...new Set(myTodos.map((t) => t.projectId))];
  const myTodosProjectWorkOrders = myTodosProjectIds.length
    ? await prisma.workOrder.findMany({
        where: { projectId: { in: myTodosProjectIds } },
        select: { id: true, parentId: true, progress: true },
      })
    : [];
  const myTodosProgressMap = computeProgress(myTodosProjectWorkOrders);
  const myTodosPreview = myTodos.slice(0, MY_TODOS_PREVIEW_LIMIT);

  const totalWorkOrders = categories.reduce(
    (sum, c) => sum + c.totalWorkOrders,
    0,
  );
  const totalProjects = categories.reduce((sum, c) => sum + c.projectCount, 0);
  const avgProgress = categories.length
    ? Math.round(
        categories.reduce((sum, c) => sum + c.progress, 0) / categories.length,
      )
    : 0;

  const combinedStatusCounts = categories.reduce<Record<string, number>>(
    (acc, c) => {
      for (const [status, count] of Object.entries(c.statusCounts)) {
        acc[status] = (acc[status] ?? 0) + count;
      }
      return acc;
    },
    {},
  );

  const chartData = categories.map((c) => ({ name: c.name, progress: c.progress }));

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900">전체 현황 대시보드</h1>
      <p className="mt-1 text-sm text-slate-500">
        카테고리별 진행률과 조직 단위 업무 현황을 한눈에 확인합니다.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="카테고리" value={`${categories.length}개`} />
        <StatCard label="프로젝트" value={`${totalProjects}개`} />
        <StatCard label="전체 Work Order" value={`${totalWorkOrders}건`} />
        <StatCard label="평균 진행률" value={`${avgProgress}%`} />
      </div>

      {session?.user && (
        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">내 할일</h2>
            {myTodos.length > MY_TODOS_PREVIEW_LIMIT && (
              <Link
                href="/my-todos"
                className="text-xs text-blue-600 hover:underline"
              >
                전체 보기 ({myTodos.length}건)
              </Link>
            )}
          </div>

          <MyTodoForm projects={projects} />

          {myTodosPreview.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">
              등록된 할 일이 없습니다.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {myTodosPreview.map((todo) => {
                const hasChildren = todo.children.length > 0;
                const progress = hasChildren
                  ? (myTodosProgressMap.get(todo.id) ?? todo.progress)
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
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">
            카테고리별 진행률
          </h2>
          <CategoryProgressChart data={chartData} />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">
            전체 상태 분포
          </h2>
          <StatusPieChart statusCounts={combinedStatusCounts} />
        </div>
      </div>

      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">
          카테고리 상세
        </h2>
        {categories.length === 0 ? (
          <p className="text-sm text-slate-400">
            등록된 카테고리가 없습니다. 프로젝트 메뉴에서 카테고리를 먼저 만들어보세요.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center gap-4">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: c.color ?? "#2563eb" }}
                />
                <span className="w-48 shrink-0 truncate text-sm text-slate-700">
                  {c.name}
                </span>
                <span className="w-28 shrink-0 text-xs text-slate-400">
                  프로젝트 {c.projectCount} · 업무 {c.totalWorkOrders}
                </span>
                <div className="flex-1">
                  <ProgressBar value={c.progress} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">
          조직 단위 진행 현황 (부서 → 과 → 팀)
        </h2>
        {orgTree.length === 0 ? (
          <p className="text-sm text-slate-400">등록된 부서가 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {orgTree.map((dept) => (
              <div key={dept.id}>
                <div className="flex items-center gap-4">
                  <span className="w-40 shrink-0 text-sm font-medium text-slate-800">
                    {dept.name}
                  </span>
                  <span className="w-20 shrink-0 text-xs text-slate-400">
                    {dept.workOrderCount}건
                  </span>
                  <div className="flex-1">
                    <ProgressBar value={dept.progress} />
                  </div>
                </div>
                {dept.children.length > 0 && (
                  <ul className="mt-2 ml-6 flex flex-col gap-2 border-l border-slate-100 pl-4">
                    {dept.children.map((div) => (
                      <li key={div.id}>
                        <div className="flex items-center gap-4">
                          <span className="w-36 shrink-0 text-sm text-slate-600">
                            {div.name}
                          </span>
                          <span className="w-20 shrink-0 text-xs text-slate-400">
                            {div.workOrderCount}건
                          </span>
                          <div className="flex-1">
                            <ProgressBar value={div.progress} />
                          </div>
                        </div>
                        {div.children.length > 0 && (
                          <ul className="mt-2 ml-6 flex flex-col gap-2 border-l border-slate-100 pl-4">
                            {div.children.map((team) => (
                              <li key={team.id} className="flex items-center gap-4">
                                <span className="w-32 shrink-0 text-xs text-slate-500">
                                  {team.name}
                                </span>
                                <span className="w-20 shrink-0 text-xs text-slate-400">
                                  {team.workOrderCount}건
                                </span>
                                <div className="flex-1">
                                  <ProgressBar value={team.progress} />
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
