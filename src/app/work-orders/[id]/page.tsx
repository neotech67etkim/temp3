import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { computeProgress } from "@/lib/progress";
import { canManageWorkOrders } from "@/lib/org-access";
import { formatAssignee } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { ProgressBar } from "@/components/progress-bar";
import { StatusEditor } from "@/components/status-editor";
import { ProgressEditor } from "@/components/progress-editor";

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
            <p className="mt-1 text-sm text-slate-500">
              {workOrder.description}
            </p>
          )}
        </div>
        <StatusBadge status={workOrder.status} />
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-5 text-sm">
        <div>
          <dt className="text-xs text-slate-400">할당 대상</dt>
          <dd className="mt-1 text-slate-700">{formatAssignee(workOrder)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">생성자</dt>
          <dd className="mt-1 text-slate-700">{workOrder.createdBy.name}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">마감일</dt>
          <dd className="mt-1 text-slate-700">
            {workOrder.dueDate
              ? workOrder.dueDate.toLocaleDateString("ko-KR")
              : "-"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">진행률 (누적)</dt>
          <dd className="mt-1">
            <ProgressBar value={rollupProgress} />
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
    </div>
  );
}
