import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { orgDb, getActiveContextInfo } from "@/lib/db";
import { getNasStore, getMigrationsDir } from "@/lib/app-config";
import {
  allStoreKeys,
  findWorkOrderById,
  getChildren,
  getProjectWorkOrders,
  getWorkOrderDetail,
} from "@/lib/work-order-tree";
import { computeProgress } from "@/lib/progress";
import { assignableUsersWhere, canManageWorkOrders } from "@/lib/org-access";
import { formatAssignee } from "@/lib/format";
import { deleteWorkOrder } from "@/actions/work-orders";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { DelayBadge } from "@/components/delay-badge";
import { TransferredBadge } from "@/components/transferred-badge";
import { ProgressBar } from "@/components/progress-bar";
import { BackToDashboard } from "@/components/back-to-dashboard";
import { StatusEditor } from "@/components/status-editor";
import { PriorityEditor } from "@/components/priority-editor";
import { ProgressEditor } from "@/components/progress-editor";
import { WorkOrderEditForm } from "@/components/work-order-edit-form";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { WorkOrderLogForm } from "@/components/work-order-log-form";
import { WorkOrderLogList } from "@/components/work-order-log-list";
import { TransferEditor } from "@/components/transfer-editor";
import { EditModeNotice } from "@/components/edit-mode-notice";

export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return null;

  const store = getNasStore();
  const migrationsDir = getMigrationsDir();
  const divisions = await orgDb.division.findMany({ select: { name: true } });
  const divisionKeys = allStoreKeys(divisions.map((d) => d.name));

  const workOrder = await getWorkOrderDetail(store, divisionKeys, migrationsDir, id);
  if (!workOrder) notFound();

  const [parentLocated, children, projectWorkOrdersLocated] = await Promise.all([
    workOrder.parentId
      ? findWorkOrderById(store, divisionKeys, migrationsDir, workOrder.parentId)
      : Promise.resolve(null),
    getChildren(store, divisionKeys, migrationsDir, workOrder.id),
    getProjectWorkOrders(store, divisionKeys, migrationsDir, workOrder.projectId),
  ]);
  const parent = parentLocated?.workOrder ?? null;

  const projectWorkOrders = projectWorkOrdersLocated.map((r) => ({
    id: r.workOrder.id,
    parentId: r.workOrder.parentId,
    progress: r.workOrder.progress,
  }));
  const progressMap = computeProgress(projectWorkOrders);
  const rollupProgress = progressMap.get(workOrder.id) ?? workOrder.progress;

  const canManage = canManageWorkOrders(session.user.role);
  const isEditing = getActiveContextInfo()?.mode === "edit";
  const isAssignedToMe = workOrder.assignedUserId === session.user.id;
  const hasChildren = children.length > 0;

  const canDirectAssign =
    canManage &&
    (workOrder.assigneeType === "USER" ||
      session.user.role === "ADMIN" ||
      (workOrder.assigneeType === "DEPARTMENT" &&
        session.user.role === "DEPT_HEAD" &&
        workOrder.assignedDeptId === session.user.departmentId) ||
      (workOrder.assigneeType === "DIVISION" &&
        session.user.role === "DIV_HEAD" &&
        workOrder.assignedDivId === session.user.divisionId));

  const transferCandidates = canDirectAssign
    ? await orgDb.user.findMany({
        where: assignableUsersWhere(session.user),
        orderBy: { name: "asc" },
      })
    : [];

  const projects = canManage
    ? await orgDb.project.findMany({ orderBy: { name: "asc" } })
    : [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <BackToDashboard />
      <div className="flex flex-col gap-1 text-xs text-slate-400">
        <Link
          href={`/projects/${workOrder.projectId}`}
          className="hover:text-blue-600"
        >
          ← {workOrder.project.name}
        </Link>
        {parent && (
          <Link
            href={`/work-orders/${parent.id}`}
            className="hover:text-blue-600"
          >
            ↳ 상위 업무: {parent.title}
          </Link>
        )}
      </div>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {workOrder.title}
          </h1>
          {workOrder.description && (
            <p className="mt-1 text-sm whitespace-pre-line text-slate-500">
              {workOrder.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <PriorityBadge priority={workOrder.priority} />
          <StatusBadge status={workOrder.status} />
          <TransferredBadge transferred={workOrder.transferred} />
          <DelayBadge
            dueDate={workOrder.dueDate}
            status={workOrder.status}
            completedAt={workOrder.completedAt}
          />
        </div>
      </div>

      {canManage && isEditing && (
        <div className="mt-3 flex items-center gap-3">
          <WorkOrderEditForm
            id={workOrder.id}
            title={workOrder.title}
            description={workOrder.description}
            dueDate={
              workOrder.dueDate
                ? workOrder.dueDate.toISOString().slice(0, 10)
                : null
            }
            projectId={workOrder.projectId}
            projects={projects}
          />
          <form action={deleteWorkOrder}>
            <input type="hidden" name="id" value={workOrder.id} />
            <ConfirmSubmitButton
              confirmMessage={`"${workOrder.title}" 업무를 삭제하시겠습니까? 하위 업무도 함께 삭제됩니다.`}
              className="text-xs text-red-500 hover:text-red-700"
            >
              삭제
            </ConfirmSubmitButton>
          </form>
        </div>
      )}
      {canManage && !isEditing && (
        <div className="mt-3">
          <EditModeNotice message="이 업무를 수정하거나 삭제하려면" />
        </div>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-5 text-sm">
        <div>
          <dt className="text-xs text-slate-400">지시자 → 담당</dt>
          <dd className="mt-1 text-slate-700">
            {workOrder.createdBy.name} → {formatAssignee(workOrder)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">진행률 (누적)</dt>
          <dd className="mt-1">
            <ProgressBar value={rollupProgress} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">지시한 완료일정</dt>
          <dd className="mt-1 text-slate-700">
            {workOrder.dueDate
              ? workOrder.dueDate.toLocaleDateString("ko-KR")
              : "-"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">실제 완료일정</dt>
          <dd className="mt-1 text-slate-700">
            {workOrder.completedAt
              ? workOrder.completedAt.toLocaleDateString("ko-KR")
              : "-"}
          </dd>
        </div>
      </dl>

      {(canManage || isAssignedToMe) && (
        <div className="mt-4 flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5">
          {!isEditing && <EditModeNotice message="상태/진행률을 변경하려면" />}
          {isEditing && (
            <>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">
                  상태 변경
                </p>
                <StatusEditor id={workOrder.id} status={workOrder.status} />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">
                  우선순위 변경
                </p>
                <PriorityEditor id={workOrder.id} priority={workOrder.priority} />
              </div>
              {!hasChildren && (
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">
                    진행률 업데이트
                  </p>
                  <ProgressEditor id={workOrder.id} progress={workOrder.progress} />
                </div>
              )}
              {hasChildren && (
                <p className="text-xs text-slate-400">
                  하위 업무가 있어 진행률은 하위 업무 평균으로 자동 계산됩니다.
                </p>
              )}
              {canDirectAssign && transferCandidates.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">
                    {workOrder.assigneeType === "USER"
                      ? "담당자 변경(이관)"
                      : "담당자 개인 지정"}
                  </p>
                  {workOrder.assigneeType !== "USER" && (
                    <p className="mb-1 text-xs text-slate-400">
                      하위 업무를 새로 만들지 않고, 이 업무 자체를 소속 인원 개인
                      담당으로 바로 넘길 수 있습니다.
                    </p>
                  )}
                  <TransferEditor
                    id={workOrder.id}
                    currentUserId={workOrder.assignedUserId}
                    candidates={transferCandidates}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">하위 업무</h2>
          {canManage && (
            <Link
              href={`/work-orders/new?projectId=${workOrder.projectId}&parentId=${workOrder.id}`}
              className="text-xs text-blue-600 hover:underline"
            >
              + 하위 업무 추가
            </Link>
          )}
        </div>
        {children.length === 0 ? (
          <p className="text-sm text-slate-400">하위 업무가 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {children.map(({ workOrder: child }) => (
              <li
                key={child.id}
                className="flex items-center gap-3 rounded-md border border-slate-100 p-3 hover:border-blue-200"
              >
                <Link
                  href={`/work-orders/${child.id}`}
                  className="flex-1 text-sm font-medium text-slate-800 hover:text-blue-600"
                >
                  {child.title}
                </Link>
                <StatusBadge status={child.status} />
                <PriorityBadge priority={child.priority} />
                <DelayBadge
                  dueDate={child.dueDate}
                  status={child.status}
                  completedAt={child.completedAt}
                />
                <span className="text-xs text-slate-400">
                  {formatAssignee(child)}
                </span>
                <div className="w-32">
                  <ProgressBar value={progressMap.get(child.id) ?? child.progress} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">
          진행관련 정보 및 질문
        </h2>
        {(canManage || isAssignedToMe) && (
          <div className="mb-6 border-b border-slate-100 pb-6">
            {isEditing ? (
              <WorkOrderLogForm workOrderId={workOrder.id} />
            ) : (
              <EditModeNotice message="진행 관련 정보를 남기려면" />
            )}
          </div>
        )}
        <WorkOrderLogList logs={workOrder.logs} />
      </div>
    </div>
  );
}
