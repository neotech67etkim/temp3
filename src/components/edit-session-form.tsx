"use client";

import { useActionState, useState } from "react";
import { startEditSession } from "@/actions/context";

export function EditSessionForm({
  divisionKey,
  locked,
  unavailable = false,
}: {
  divisionKey: string;
  locked: boolean;
  /** 지금 시도해도 절대 성공할 수 없는 상태(다른 사람이 이미 활발히 편집 중이거나,
   *  이 프로그램 자체가 다른 사람의 편집 세션으로 이미 차 있는 경우). true면 버튼 대신
   *  "편집불가" 표시만 하고, 무의미한 시도/거부 왕복을 아예 막는다. */
  unavailable?: boolean;
}) {
  const [message, formAction, isPending] = useActionState(
    startEditSession,
    undefined,
  );
  const [force, setForce] = useState(false);
  const offerForce = !!message && message.includes("강제로");

  if (unavailable) {
    return (
      <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-400">
        편집불가
      </span>
    );
  }

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
