"use client";

import { useActionState } from "react";
import { startEditSession } from "@/actions/context";

export function EditSessionForm({
  divisionKey,
  locked,
  isMyLock = false,
  unavailable = false,
}: {
  divisionKey: string;
  locked: boolean;
  /** 잠금이 걸려 있긴 한데 그게 나 자신의 예전 세션인 경우(예: 프로그램 재시작으로
   *  메모리 상태만 사라진 경우). 대기 없이 바로 이어받을 수 있으므로 문구를 다르게 보여준다. */
  isMyLock?: boolean;
  /** 지금 시도해도 절대 성공할 수 없는 상태(다른 사람이 이미 활발히 편집 중이거나,
   *  이 프로그램 자체가 다른 사람의 편집 세션으로 이미 차 있는 경우). true면 버튼 대신
   *  "편집불가" 표시만 하고, 무의미한 시도/거부 왕복을 아예 막는다. */
  unavailable?: boolean;
}) {
  const [message, formAction, isPending] = useActionState(
    startEditSession,
    undefined,
  );

  if (unavailable) {
    return (
      <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-400">
        편집불가
      </span>
    );
  }

  const label = isPending
    ? "확인 중..."
    : isMyLock
      ? "이어서 편집"
      : locked
        ? "편집 시도"
        : "편집 시작";

  return (
    <form action={formAction} className="flex shrink-0 flex-col items-end gap-1">
      <input type="hidden" name="key" value={divisionKey} />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {label}
      </button>
      {message && (
        <p className="max-w-[220px] text-right text-[11px] text-red-500">{message}</p>
      )}
    </form>
  );
}
