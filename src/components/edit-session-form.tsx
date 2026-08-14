"use client";

import { useActionState, useState } from "react";
import { startEditSession } from "@/actions/context";

export function EditSessionForm({
  divisionKey,
  locked,
}: {
  divisionKey: string;
  locked: boolean;
}) {
  const [message, formAction, isPending] = useActionState(
    startEditSession,
    undefined,
  );
  const [force, setForce] = useState(false);
  const offerForce = !!message && message.includes("강제로");

  return (
    <form action={formAction} className="flex shrink-0 flex-col items-end gap-1">
      <input type="hidden" name="key" value={divisionKey} />
      {force && <input type="hidden" name="force" value="on" />}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {isPending ? "확인 중..." : locked ? "편집 시도" : "편집 시작"}
      </button>
      {offerForce && (
        <label className="flex items-center gap-1 text-[11px] text-slate-500">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
          />
          강제로 이어받기
        </label>
      )}
      {message && (
        <p className="max-w-[220px] text-right text-[11px] text-red-500">{message}</p>
      )}
    </form>
  );
}
