"use client";

import { reassignWorkOrder } from "@/actions/work-orders";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export function TransferEditor({
  id,
  currentUserId,
  candidates,
}: {
  id: string;
  currentUserId: string | null;
  candidates: { id: string; name: string }[];
}) {
  const action = reassignWorkOrder.bind(null, id);

  return (
    <form action={action} className="flex items-center gap-2">
      <select
        name="assigneeId"
        defaultValue={currentUserId ?? ""}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      >
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <ConfirmSubmitButton
        confirmMessage="선택한 담당자에게 이 업무를 이관하시겠습니까?"
        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
      >
        이관
      </ConfirmSubmitButton>
    </form>
  );
}
