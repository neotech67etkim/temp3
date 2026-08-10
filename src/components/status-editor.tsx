"use client";

import type { WorkOrderStatus } from "@prisma/client";
import { updateWorkOrderStatus } from "@/actions/work-orders";
import { STATUS_LABEL } from "@/components/status-badge";

export function StatusEditor({
  id,
  status,
}: {
  id: string;
  status: WorkOrderStatus;
}) {
  const action = updateWorkOrderStatus.bind(null, id);

  return (
    <form action={action}>
      <select
        name="status"
        defaultValue={status}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      >
        {Object.entries(STATUS_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </form>
  );
}
