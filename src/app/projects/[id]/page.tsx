import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { orgDb } from "@/lib/db";
import { getNasStore, getMigrationsDir } from "@/lib/app-config";
import {
  DEPT_COMMON_KEY,
  allStoreKeys,
  getProjectWorkOrdersDetailed,
} from "@/lib/work-order-tree";
import { buildTree, computeProgress, type TreeNode } from "@/lib/progress";
import { canManageWorkOrders, DEPT_COMMON_LABEL } from "@/lib/org-access";
import { WorkOrderTree, type WorkOrderTreeItem } from "@/components/work-order-tree";
import { BackToDashboard } from "@/components/back-to-dashboard";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const canManage = session?.user ? canManageWorkOrders(session.user.role) : false;

  const project = await orgDb.project.findUnique({
    where: { id },
    include: { category: true },
  });

  if (!project) notFound();

  const store = getNasStore();
  const migrationsDir = getMigrationsDir();
  const divisions = await orgDb.division.findMany({ select: { name: true } });
  const divisionKeys = allStoreKeys(divisions.map((d) => d.name));

  const located = await getProjectWorkOrdersDetailed(store, divisionKeys, migrationsDir, id);
  const workOrders = located
    .map((r) => r.workOrder)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const progressMap = computeProgress(workOrders);
  const tree = buildTree(workOrders) as TreeNode<WorkOrderTreeItem>[];

  // 최상위(부모 없는) 업무가 실제로 어느 과 파일에 저장돼 있는지로 묶는다.
  // 하위 업무는 부모가 다른 과 파일에 있어도 그대로 부모 트리 밑에 중첩되어
  // 보이므로(work-order-tree.ts의 교차-과 조회 특성), 그룹 소속은 최상위
  // 업무 기준으로만 정하면 트리 구조가 끊기지 않는다.
  const keyByRootId = new Map(located.map((r) => [r.workOrder.id, r.key]));
  const rootsByDivision = new Map<string, TreeNode<WorkOrderTreeItem>[]>();
  for (const root of tree) {
    const key = keyByRootId.get(root.id) ?? DEPT_COMMON_KEY;
    if (!rootsByDivision.has(key)) rootsByDivision.set(key, []);
    rootsByDivision.get(key)!.push(root);
  }
  const divisionGroups = [...rootsByDivision.keys()].sort((a, b) => {
    if (a === DEPT_COMMON_KEY) return -1;
    if (b === DEPT_COMMON_KEY) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <BackToDashboard />
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {project.name}
          </h1>
          {project.description && (
            <p className="mt-1 text-sm text-slate-500">{project.description}</p>
          )}
          <p className="mt-1 text-xs text-slate-400">
            업무영역: {project.category?.name ?? "없음"}
          </p>
        </div>
        {canManage && (
          <Link
            href={`/work-orders/new?projectId=${project.id}`}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + 업무 할당
          </Link>
        )}
      </div>

      {tree.length === 0 ? (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">
            Work Order 트리
          </h2>
          <p className="text-sm text-slate-400">등록된 Work Order가 없습니다.</p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {divisionGroups.map((key) => (
            <div
              key={key}
              className="rounded-lg border border-slate-200 bg-white p-5"
            >
              <h2 className="mb-4 text-sm font-semibold text-slate-800">
                {key === DEPT_COMMON_KEY ? DEPT_COMMON_LABEL : key}
              </h2>
              <WorkOrderTree
                nodes={rootsByDivision.get(key)!}
                progressMap={progressMap}
                projectId={project.id}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
