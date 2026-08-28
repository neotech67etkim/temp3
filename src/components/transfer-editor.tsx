"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { reassignWorkOrder, type ReassignState } from "@/actions/work-orders";

function TransferSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (
          !pending &&
          !confirm("선택한 담당자에게 이 업무를 이관하시겠습니까?")
        ) {
          e.preventDefault();
        }
      }}
      className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
    >
      {pending ? "이관 처리 중..." : "이관"}
    </button>
  );
}

export function TransferEditor({
  id,
  currentUserId,
  candidates,
}: {
  id: string;
  currentUserId: string | null;
  candidates: { id: string; name: string }[];
}) {
  const boundAction = reassignWorkOrder.bind(null, id);
  const [state, formAction] = useActionState<ReassignState, FormData>(
    boundAction,
    undefined,
  );

  // 이관 처리 중에는 버튼을 "이관 처리 중..."으로 바꿔 보여주고
  // (TransferSubmitButton), 완료되면 결과를 알림창으로 띄워 사용자가
  // 놓치지 않게 한다.
  useEffect(() => {
    if (state?.message) alert(state.message);
  }, [state]);

  return (
    <form action={formAction} className="flex items-center gap-2">
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
      <TransferSubmitButton />
    </form>
  );
}
