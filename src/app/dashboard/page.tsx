import Link from "next/link";
import { auth } from "@/auth";
import { orgDb } from "@/lib/db";
import { allStoreKeys } from "@/lib/work-order-tree";
import { queryAllDivisions } from "@/lib/multi-division-query";
import { getOrgProgressTree } from "@/lib/dashboard";
import { computeProgress } from "@/lib/progress";
import { formatAssignee } from "@/lib/format";
import { canManageWorkOrders, myWorkListWhere } from "@/lib/org-access";
import { ProgressBar } from "@/components/progress-bar";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { DelayBadge } from "@/components/delay-badge";
import { TransferredBadge } from "@/components/transferred-badge";
import { MyTodoForm } from "@/components/my-todo-form";
import { AutoRefresh } from "@/components/auto-refresh";

const RECENT_LOG_LIMIT = 5;

export default async function DashboardPage() {
  const session = await auth();
  const canDelegate = session?.user
    ? canManageWorkOrders(session.user.role)
    : false;

  const divisions = await orgDb.division.findMany({ select: { name: true } });
  const divisionKeys = allStoreKeys(divisions.map((d) => d.name));

  const [orgTree, projects, workListResults] = await Promise.all([
    getOrgProgressTree(divisionKeys),
    session?.user
      ? orgDb.project.findMany({ orderBy: { name: "asc" } })
      : Promise.resolve([]),
    session?.user
      ? queryAllDivisions(divisionKeys, (client) =>
          client.workOrder.findMany({
            where: {
              AND: [myWorkListWhere(session.user), { status: { not: "COMPLETED" } }],
            },
            include: {
              project: { select: { name: true } },
              createdBy: { select: { name: true } },
              assignedDept: { select: { name: true } },
              assignedDiv: { select: { name: true } },
              assignedTeam: { select: { name: true } },
              assignedUser: { select: { name: true } },
            },
          }),
        )
      : Promise.resolve([]),
  ]);

  const workList = workListResults
    .flatMap((r) => r.value)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status.localeCompare(b.status);
      if (a.priority !== b.priority) return a.priority.localeCompare(b.priority);
      const aDue = a.dueDate?.getTime() ?? Infinity;
      const bDue = b.dueDate?.getTime() ?? Infinity;
      return aDue - bDue;
    });

  const recentLogs = session?.user
    ? (
        await queryAllDivisions(divisionKeys, (client) =>
          client.workOrderLog.findMany({
            where: {
              workOrder: {
                AND: [myWorkListWhere(session.user), { status: { not: "COMPLETED" } }],
              },
            },
            include: {
              author: { select: { name: true } },
              workOrder: { select: { id: true, title: true } },
            },
            orderBy: { createdAt: "desc" },
            take: RECENT_LOG_LIMIT,
          }),
        )
      )
        .flatMap((r) => r.value)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, RECENT_LOG_LIMIT)
    : [];

  const workListProjectIds = [...new Set(workList.map((t) => t.projectId))];
  const workListProjectWorkOrders = workListProjectIds.length
    ? (
        await queryAllDivisions(divisionKeys, (client) =>
          client.workOrder.findMany({
            where: { projectId: { in: workListProjectIds } },
            select: { id: true, parentId: true, progress: true },
          }),
        )
      ).flatMap((r) => r.value)
    : [];
  const workListProgressMap = computeProgress(workListProjectWorkOrders);
  const childParentIds = new Set(
    workListProjectWorkOrders.map((w) => w.parentId).filter((id): id is string => !!id),
  );

  const myDeptTree = session?.user?.departmentId
    ? orgTree.filter((d) => d.id === session.user.departmentId)
    : orgTree;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">전체 현황 대시보드</h1>
          <p className="mt-1 text-sm text-slate-500">
            내 업무리스트와 과별 진행현황을 확인하세요.
          </p>
        </div>
        <AutoRefresh intervalSeconds={60} />
      </div>

      {session?.user && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">
              내 업무리스트
            </h2>
            <Link
              href="/work-orders/completed"
              className="text-xs text-blue-600 hover:underline"
            >
              완료된 업무 보기
            </Link>
          </div>

          <MyTodoForm projects={projects} />

          {workList.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">표시할 업무가 없습니다.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {workList.map((item) => {
                const hasChildren = childParentIds.has(item.id);
                const progress = hasChildren
                  ? (workListProgressMap.get(item.id) ?? item.progress)
                  : item.progress;
                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center gap-3 rounded-md border border-slate-100 p-3 hover:border-blue-200"
                  >
                    <div className="min-w-[200px] flex-1">
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
      )}

      {recentLogs.length > 0 && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">
            최근 진행관련 정보 및 질문
          </h2>
          <ul className="flex flex-col gap-3">
            {recentLogs.map((log) => (
              <li
                key={log.id}
                className="rounded-md border border-slate-100 p-3 hover:border-blue-200"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/work-orders/${log.workOrder.id}`}
                    className="text-sm font-medium text-slate-800 hover:text-blue-600"
                  >
                    {log.workOrder.title}
                  </Link>
                  <span className="text-xs text-slate-400">
                    {log.author.name} · {log.createdAt.toLocaleString("ko-KR")}
                  </span>
                </div>
                {log.note && (
                  <p className="mt-1 text-sm whitespace-pre-line text-slate-600">
                    {log.note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">
          과별 진행현황
        </h2>
        {myDeptTree.length === 0 ? (
          <p className="text-sm text-slate-400">등록된 부서가 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {myDeptTree.map((dept) => (
              <div key={dept.id}>
                <div className="flex items-center gap-4">
                  <Link
                    href={`/work-orders?dept=${encodeURIComponent(dept.name)}`}
                    className="w-40 shrink-0 text-sm font-medium text-slate-800 hover:text-blue-600 hover:underline"
                  >
                    {dept.name}
                  </Link>
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
                      <li key={div.id} className="flex items-center gap-4">
                        <Link
                          href={`/work-orders?dept=${encodeURIComponent(dept.name)}&div=${encodeURIComponent(div.name)}`}
                          className="w-36 shrink-0 text-sm text-slate-600 hover:text-blue-600 hover:underline"
                        >
                          {div.name}
                        </Link>
                        <span className="w-20 shrink-0 text-xs text-slate-400">
                          {div.workOrderCount}건
                        </span>
                        <div className="flex-1">
                          <ProgressBar value={div.progress} />
                        </div>
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
