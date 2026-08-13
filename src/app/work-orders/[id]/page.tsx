import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { computeProgress } from "@/lib/progress";
import { assignableUsersWhere, canManageWorkOrders } from "@/lib/org-access";
import { formatAssignee } from "@/lib/format";
import { deleteWorkOrder } from "@/actions/work-orders";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { DelayBadge } from "@/components/delay-badge";
import { ProgressBar } from "@/components/progress-bar";
import { StatusEditor } from "@/components/status-editor";
import { PriorityEditor } from "@/components/priority-editor";
import { ProgressEditor } from "@/components/progress-editor";
import { WorkOrderEditForm } from "@/components/work-order-edit-form";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { WorkOrderLogForm } from "@/components/work-order-log-form";
import { WorkOrderLogList } from "@/components/work-order-log-list";
import { TransferEditor } from "@/components/transfer-editor";

export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return null;

  const workOrder = await prisma.workOrder.findUnique({
    where: { id },
    include: {
      project: true,
      parent: { select: { id: true, title: true } },
      children: {
        include: {
          assignedDept: { select: { name: true } },
          assignedDiv: { select: { name: true } },
          assignedTeam: { select: { name: true } },
          assignedUser: { select: { name: true } },
        },
      },
      assignedDept: { select: { name: true } },
      assignedDiv: { select: { name: true } },
      assignedTeam: { select: { name: true } },
      assignedUser: { select: { name: true } },
      createdBy: { select: { name: true } },
      logs: {
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!workOrder) notFound();

  const projectWorkOrders = await prisma.workOrder.findMany({
    where: { projectId: workOrder.projectId },
    select: { id: true, parentId: true, progress: true },
  });
  const progressMap = computeProgress(projectWorkOrders);
  const rollupProgress = progressMap.get(workOrder.id) ?? workOrder.progress;

  const canManage = canManageWorkOrders(session.user.role);
  const isAssignedToMe = workOrder.assignedUserId === session.user.id;
  const hasChildren = workOrder.children.length > 0;

  const transferCandidates =
    canManage && workOrder.assigneeType === "USER"
      ? await prisma.user.findMany({
          where: assignableUsersWhere(session.user),
          orderBy: { name: "asc" },
        })
      : [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex flex-col gap-1 text-xs text-slate-400">
        <Link
          href={`/projects/${workOrder.projectId}`}
          className="hover:text-blue-600"
        >
          ← {workOrder.project.name}
        </Link>
        {workOrder.parent && (
          <Link
            href={`/work-orders/${workOrder.parent.id}`}
            className="hover:text-blue-600"
          >
            ↳ 상위 업무: {workOrder.parent.title}
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
          <DelayBadge
            dueDate={workOrder.dueDate}
            status={workOrder.status}
            completedAt={workOrder.completedAt}
          />
        </div>
      </div>

      {canManage && (
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
          {canManage && transferCandidates.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">
                담당자 변경(이관)
              </p>
              <TransferEditor
                id={workOrder.id}
                currentUserId={workOrder.assignedUserId}
                candidates={transferCandidates}
              />
            </div>
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
        {workOrder.children.length === 0 ? (
          <p className="text-sm text-slate-400">하위 업무가 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {workOrder.children.map((child) => (
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
          진행 경과
        </h2>
        {(canManage || isAssignedToMe) && (
          <div className="mb-6 border-b border-slate-100 pb-6">
            <WorkOrderLogForm workOrderId={workOrder.id} />
          </div>
        )}
        <WorkOrderLogList logs={workOrder.logs} />
      </div>
    </div>
  );
}
