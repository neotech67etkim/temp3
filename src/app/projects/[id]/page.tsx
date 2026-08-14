import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { orgDb } from "@/lib/db";
import { getNasStore, getMigrationsDir } from "@/lib/app-config";
import { allStoreKeys, getProjectWorkOrdersDetailed } from "@/lib/work-order-tree";
import { buildTree, computeProgress } from "@/lib/progress";
import { canManageWorkOrders } from "@/lib/org-access";
import { WorkOrderTree } from "@/components/work-order-tree";
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
  const tree = buildTree(workOrders);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <BackToDashboard />
      <Link href="/projects" className="text-xs text-slate-400 hover:text-blue-600">
        ← 프로젝트 목록
      </Link>
      <div className="mt-2 flex items-start justify-between">
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

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">
          Work Order 트리
        </h2>
        <WorkOrderTree
          nodes={tree}
          progressMap={progressMap}
          projectId={project.id}
        />
      </div>
    </div>
  );
}
