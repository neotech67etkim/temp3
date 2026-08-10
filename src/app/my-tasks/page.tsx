import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/status-badge";
import { StatusEditor } from "@/components/status-editor";
import { ProgressEditor } from "@/components/progress-editor";

export default async function MyTasksPage() {
  const session = await auth();
  if (!session?.user) return null;

  const workOrders = await prisma.workOrder.findMany({
    where: { assignedUserId: session.user.id },
    include: { project: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900">내 업무</h1>
      <p className="mt-1 text-sm text-slate-500">
        나에게 할당된 업무를 확인하고 진행 상황을 업데이트합니다.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        {workOrders.length === 0 ? (
          <p className="text-sm text-slate-400">할당된 업무가 없습니다.</p>
        ) : (
          workOrders.map((wo) => (
            <div
              key={wo.id}
              className="rounded-lg border border-slate-200 bg-white p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Link
                    href={`/work-orders/${wo.id}`}
                    className="text-sm font-medium text-slate-800 hover:text-blue-600"
                  >
                    {wo.title}
                  </Link>
                  <p className="mt-1 text-xs text-slate-400">
                    {wo.project.name}
                    {wo.dueDate &&
                      ` · 마감 ${wo.dueDate.toLocaleDateString("ko-KR")}`}
                  </p>
                </div>
                <StatusBadge status={wo.status} />
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4">
                <StatusEditor id={wo.id} status={wo.status} />
                <ProgressEditor id={wo.id} progress={wo.progress} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
