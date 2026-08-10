"use client";

import type { Priority } from "@prisma/client";
import { updateWorkOrderPriority } from "@/actions/work-orders";
import { PRIORITY_LABEL } from "@/components/priority-badge";

export function PriorityEditor({
  id,
  priority,
}: {
  id: string;
  priority: Priority;
}) {
  const action = updateWorkOrderPriority.bind(null, id);

  return (
    <form action={action}>
      <select
        name="priority"
        defaultValue={priority}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      >
        {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </form>
  );
}
