import Link from "next/link";
import { auth } from "@/auth";
import { orgDb } from "@/lib/db";
import { allStoreKeys } from "@/lib/work-order-tree";
import { queryAllDivisions } from "@/lib/multi-division-query";
import { computeProgress } from "@/lib/progress";
import { canManageWorkOrders } from "@/lib/org-access";
import { createProject, createCategory } from "@/actions/work-orders";
import { ProgressBar } from "@/components/progress-bar";
import { BackToDashboard } from "@/components/back-to-dashboard";

export default async function ProjectsPage() {
  const session = await auth();
  const canManage = session?.user ? canManageWorkOrders(session.user.role) : false;

  // Project/Category는 division 파일이 아니라 조직 원본(org.db)에 있으므로
  // orgDb로 읽고, 각 프로젝트의 진행률 계산에 필요한 WorkOrder만 전체 과
  // 파일에서 모아온다.
  const divisions = await orgDb.division.findMany({ select: { name: true } });
  const divisionKeys = allStoreKeys(divisions.map((d) => d.name));

  const [projectRows, categories, workOrderResults] = await Promise.all([
    orgDb.project.findMany({
      include: { category: true },
      orderBy: { createdAt: "desc" },
    }),
    orgDb.category.findMany({ orderBy: { name: "asc" } }),
    queryAllDivisions(divisionKeys, (client) =>
      client.workOrder.findMany({
        select: { id: true, parentId: true, projectId: true, progress: true },
      }),
    ),
  ]);
  const allWorkOrders = workOrderResults.flatMap((r) => r.value);
  const workOrdersByProject = new Map<string, typeof allWorkOrders>();
  for (const wo of allWorkOrders) {
    if (!workOrdersByProject.has(wo.projectId)) workOrdersByProject.set(wo.projectId, []);
    workOrdersByProject.get(wo.projectId)!.push(wo);
  }
  const projects = projectRows.map((p) => ({
    ...p,
    workOrders: workOrdersByProject.get(p.id) ?? [],
  }));

  const UNCATEGORIZED_GROUP = "업무영역 없음";
  const groups = new Map<string, typeof projects>();
  for (const project of projects) {
    const key = project.category?.name ?? UNCATEGORIZED_GROUP;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(project);
  }
  const sortedGroupNames = [...groups.keys()].sort((a, b) => {
    if (a === UNCATEGORIZED_GROUP) return 1;
    if (b === UNCATEGORIZED_GROUP) return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <BackToDashboard />
      <h1 className="text-xl font-semibold text-slate-900">프로젝트</h1>
      <p className="mt-1 text-sm text-slate-500">
        공통 프로젝트 단위로 Work Order를 관리합니다.
      </p>

      <div className="mt-6 flex flex-col gap-6">
        {projects.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-400">등록된 프로젝트가 없습니다.</p>
          </div>
        ) : (
          sortedGroupNames.map((groupName) => (
            <div
              key={groupName}
              className="rounded-lg border border-slate-200 bg-white p-5"
            >
              <h2 className="mb-4 text-sm font-semibold text-slate-800">
                {groupName}
              </h2>
              <ul className="flex flex-col gap-3">
                {groups.get(groupName)!.map((project) => {
                  const progressMap = computeProgress(project.workOrders);
                  const roots = project.workOrders.filter((w) => !w.parentId);
                  const overall = roots.length
                    ? Math.round(
                        roots.reduce(
                          (sum, w) => sum + (progressMap.get(w.id) ?? 0),
                          0,
                        ) / roots.length,
                      )
                    : 0;
                  return (
                    <li
                      key={project.id}
                      className="flex items-center gap-4 rounded-md border border-slate-100 p-3 hover:border-blue-200"
                    >
                      <Link
                        href={`/projects/${project.id}`}
                        className="flex-1 text-sm font-medium text-slate-800 hover:text-blue-600"
                      >
                        {project.name}
                      </Link>
                      <span className="text-xs text-slate-400">
                        업무 {project.workOrders.length}건
                      </span>
                      <div className="w-40">
                        <ProgressBar value={overall} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>

      {canManage && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <form
            action={createCategory}
            className="rounded-lg border border-slate-200 bg-white p-5"
          >
            <h3 className="mb-3 text-sm font-semibold text-slate-800">
              업무영역 추가
            </h3>
            <input
              name="name"
              required
              placeholder="업무영역명"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="color"
              type="color"
              defaultValue="#2563eb"
              className="mt-2 h-9 w-full rounded-md border border-slate-300"
            />
            <button
              type="submit"
              className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              추가
            </button>
          </form>

          <form
            action={createProject}
            className="rounded-lg border border-slate-200 bg-white p-5"
          >
            <h3 className="mb-3 text-sm font-semibold text-slate-800">
              프로젝트 추가
            </h3>
            <input
              name="name"
              required
              placeholder="프로젝트명"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <textarea
              name="description"
              placeholder="설명 (선택)"
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              rows={2}
            />
            <select
              name="categoryId"
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">업무영역 선택 (선택)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              추가
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
