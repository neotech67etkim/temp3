import Link from "next/link";
import type { Priority, WorkOrderStatus } from "@prisma/client";
import type { TreeNode } from "@/lib/progress";
import { formatAssignee, type AssigneeInfo } from "@/lib/format";
import { ProgressBar } from "@/components/progress-bar";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";

export type WorkOrderTreeItem = AssigneeInfo & {
  id: string;
  title: string;
  status: WorkOrderStatus;
  priority: Priority;
};

export function WorkOrderTree({
  nodes,
  progressMap,
  projectId,
}: {
  nodes: TreeNode<WorkOrderTreeItem>[];
  progressMap: Map<string, number>;
  projectId: string;
}) {
  if (nodes.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        등록된 Work Order가 없습니다.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {nodes.map((node) => (
        <li key={node.id}>
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-slate-100 p-3 hover:border-blue-200">
            <Link
              href={`/work-orders/${node.id}`}
              className="text-sm font-medium text-slate-800 hover:text-blue-600"
            >
              {node.title}
            </Link>
            <StatusBadge status={node.status} />
            <PriorityBadge priority={node.priority} />
            <span className="text-xs text-slate-400">
              {formatAssignee(node)}
            </span>
            <div className="w-40">
              <ProgressBar value={progressMap.get(node.id) ?? 0} />
            </div>
            <Link
              href={`/work-orders/new?projectId=${projectId}&parentId=${node.id}`}
              className="ml-auto text-xs text-blue-600 hover:underline"
            >
              + 하위 업무 할당
            </Link>
          </div>
          {node.children.length > 0 && (
            <div className="mt-2 ml-6 border-l border-slate-100 pl-4">
              <WorkOrderTree
                nodes={node.children}
                progressMap={progressMap}
                projectId={projectId}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
