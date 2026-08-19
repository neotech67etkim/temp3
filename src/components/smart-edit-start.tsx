"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { startEditSession } from "@/actions/context";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
    >
      {pending ? "확인 중..." : "편집 시작"}
    </button>
  );
}

/**
 * 지금 보고 있는 이 Work Order가 속한 과(divisionKey)를 대상으로 바로
 * 편집을 시도한다. 가능하면 편집 세션을 열고 이 화면(returnTo)으로 바로
 * 돌아오고, 다른 사람이 편집 중이면(또는 이 프로세스가 이미 다른 사람의
 * 편집 세션으로 차 있으면) "OOO님이 편집 중입니다" 안내만 보여주고
 * /select-division으로 돌아다니지 않아도 되게 한다.
 */
export function SmartEditStart({
  divisionKey,
  returnTo,
  message,
}: {
  divisionKey: string;
  returnTo: string;
  message?: string;
}) {
  const [errorMessage, formAction] = useActionState(startEditSession, undefined);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
      <p className="flex-1 text-sm text-slate-500">
        {message ?? "편집을 시작하면 이 화면에서 바로 계속 편집할 수 있습니다."}
      </p>
      <form action={formAction} className="flex shrink-0 items-center gap-2">
        <input type="hidden" name="key" value={divisionKey} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <SubmitButton />
      </form>
      {errorMessage && (
        <p className="w-full text-xs text-red-500">{errorMessage}</p>
      )}
    </div>
  );
}
