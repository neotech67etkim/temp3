"use client";

import { useActionState } from "react";
import { updateOwnAccount } from "@/actions/account";

export function AccountForm({ currentEmail }: { currentEmail: string }) {
  const [message, formAction, isPending] = useActionState(
    updateOwnAccount,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          로그인 이메일 (아이디)
        </label>
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
          {currentEmail}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          정책상 아이디(로그인 이메일)는 변경할 수 없습니다. 변경이
          필요하면 관리자에게 문의하세요.
        </p>
      </div>

      <hr className="border-slate-100" />

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          현재 비밀번호 (확인용, 필수)
        </label>
        <input
          name="currentPassword"
          type="password"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          새 비밀번호
        </label>
        <input
          name="newPassword"
          type="password"
          placeholder="변경하지 않으려면 비워두세요 (8자 이상)"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          새 비밀번호 확인
        </label>
        <input
          name="newPasswordConfirm"
          type="password"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      {message && (
        <p className="text-sm text-blue-700">{message}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="mt-2 self-start rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {isPending ? "저장 중..." : "저장"}
      </button>
    </form>
  );
}
