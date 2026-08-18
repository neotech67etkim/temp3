import { auth } from "@/auth";
import { orgDb, getActiveContextInfo } from "@/lib/db";
import { getNasStore, getMigrationsDir } from "@/lib/app-config";
import { allStoreKeys, findWorkOrderById } from "@/lib/work-order-tree";
import {
  assignableTypesFor,
  assignableUsersWhere,
  canManageWorkOrders,
} from "@/lib/org-access";
import { WorkOrderForm } from "@/components/work-order-form";
import { BackToDashboard } from "@/components/back-to-dashboard";
import { EditModeNotice } from "@/components/edit-mode-notice";

export default async function NewWorkOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; parentId?: string }>;
}) {
  const { projectId, parentId } = await searchParams;
  const session = await auth();

  if (!session?.user || !canManageWorkOrders(session.user.role)) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <BackToDashboard />
        <p className="text-sm text-red-600">업무를 생성할 권한이 없습니다.</p>
      </div>
    );
  }

  const isAdmin = session.user.role === "ADMIN";
  const allowedTypes = assignableTypesFor(session.user.role);
  const isEditing = getActiveContextInfo()?.mode === "edit";

  const [projects, departments, divisions, teams, users] = await Promise.all([
    orgDb.project.findMany({ orderBy: { name: "asc" } }),
    isAdmin
      ? orgDb.department.findMany({ orderBy: { name: "asc" } })
      : Promise.resolve([]),
    isAdmin
      ? orgDb.division.findMany({ orderBy: { name: "asc" } })
      : Promise.resolve([]),
    isAdmin
      ? orgDb.team.findMany({ orderBy: { name: "asc" } })
      : Promise.resolve([]),
    orgDb.user.findMany({
      where: assignableUsersWhere(session.user),
      orderBy: { name: "asc" },
    }),
  ]);

  let parent: { title: string } | null = null;
  if (parentId) {
    const store = getNasStore();
    const migrationsDir = getMigrationsDir();
    const allDivisions = await orgDb.division.findMany({ select: { name: true } });
    const divisionKeys = allStoreKeys(allDivisions.map((d) => d.name));
    const located = await findWorkOrderById(store, divisionKeys, migrationsDir, parentId);
    parent = located ? { title: located.workOrder.title } : null;
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <BackToDashboard />
      <h1 className="text-xl font-semibold text-slate-900">Work Order 할당</h1>
      {parent && (
        <p className="mt-1 text-sm text-slate-500">
          상위 업무: <span className="font-medium">{parent.title}</span> 아래로
          하위 업무를 할당합니다.
        </p>
      )}
      {!isAdmin && users.length === 0 && (
        <p className="mt-1 text-sm text-amber-600">
          할당 가능한 인원이 없습니다. 조직 배치를 관리자에게 문의하세요.
        </p>
      )}

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        {isEditing ? (
          <WorkOrderForm
            projects={projects}
            departments={departments}
            divisions={divisions}
            teams={teams}
            users={users}
            allowedTypes={allowedTypes}
            defaultProjectId={projectId}
            parentId={parentId}
          />
        ) : (
          <EditModeNotice message="업무를 할당하려면" />
        )}
      </div>
    </div>
  );
}
