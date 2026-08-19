"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { startEditSessionAll } from "@/actions/context";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
    >
      {pending ? "확인 중..." : "전체 편집 시작"}
    </button>
  );
}

/** 소속된 과 여러 개(부서장이면 부서 전체, 관리자면 전체)를 한 번에 편집
 *  모드로 연다. 일부만 잠겨 있어도 나머지는 열리고, 못 연 과는 nav의
 *  "편집불가" 표시로 알 수 있다. */
export function StartAllEditForm({ disabled }: { disabled?: boolean }) {
  const [message, formAction] = useActionState(startEditSessionAll, undefined);

  if (disabled) {
    return (
      <span className="inline-block rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-400">
        편집불가
      </span>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <form action={formAction}>
        <SubmitButton />
      </form>
      {message && <p className="text-xs text-red-500">{message}</p>}
    </div>
  );
}
