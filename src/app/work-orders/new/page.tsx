import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { canManageWorkOrders } from "@/lib/org-access";
import { WorkOrderForm } from "@/components/work-order-form";

export default async function NewWorkOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; parentId?: string }>;
}) {
  const { projectId, parentId } = await searchParams;
  const session = await auth();

  if (!session?.user || !canManageWorkOrders(session.user.role)) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <p className="text-sm text-red-600">업무를 생성할 권한이 없습니다.</p>
      </div>
    );
  }

  const [projects, departments, divisions, teams, users, parent] =
    await Promise.all([
      prisma.project.findMany({ orderBy: { name: "asc" } }),
      prisma.department.findMany({ orderBy: { name: "asc" } }),
      prisma.division.findMany({ orderBy: { name: "asc" } }),
      prisma.team.findMany({ orderBy: { name: "asc" } }),
      prisma.user.findMany({ orderBy: { name: "asc" } }),
      parentId
        ? prisma.workOrder.findUnique({
            where: { id: parentId },
            select: { title: true },
          })
        : Promise.resolve(null),
    ]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900">Work Order 할당</h1>
      {parent && (
        <p className="mt-1 text-sm text-slate-500">
          상위 업무: <span className="font-medium">{parent.title}</span> 아래로
          하위 업무를 할당합니다.
        </p>
      )}

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <WorkOrderForm
          projects={projects}
          departments={departments}
          divisions={divisions}
          teams={teams}
          users={users}
          defaultProjectId={projectId}
          parentId={parentId}
        />
      </div>
    </div>
  );
}
