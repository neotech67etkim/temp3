import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { computeProgress } from "@/lib/progress";
import { canManageWorkOrders } from "@/lib/org-access";
import { createProject, createCategory } from "@/actions/work-orders";
import { ProgressBar } from "@/components/progress-bar";

export default async function ProjectsPage() {
  const session = await auth();
  const canManage = session?.user ? canManageWorkOrders(session.user.role) : false;

  const [projects, categories] = await Promise.all([
    prisma.project.findMany({
      include: {
        category: true,
        workOrders: { select: { id: true, parentId: true, progress: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900">프로젝트</h1>
      <p className="mt-1 text-sm text-slate-500">
        공통 프로젝트 단위로 Work Order를 관리합니다.
      </p>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">
          프로젝트 목록
        </h2>
        {projects.length === 0 ? (
          <p className="text-sm text-slate-400">등록된 프로젝트가 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {projects.map((project) => {
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
                    {project.category?.name ?? "카테고리 없음"}
                  </span>
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
        )}
      </div>

      {canManage && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <form
            action={createCategory}
            className="rounded-lg border border-slate-200 bg-white p-5"
          >
            <h3 className="mb-3 text-sm font-semibold text-slate-800">
              카테고리 추가
            </h3>
            <input
              name="name"
              required
              placeholder="카테고리명"
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
              <option value="">카테고리 선택 (선택)</option>
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
