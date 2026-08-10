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
          현재 비밀번호 (확인용, 필수)
        </label>
        <input
          name="currentPassword"
          type="password"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <hr className="border-slate-100" />

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          로그인 이메일 (아이디)
        </label>
        <input
          name="email"
          type="email"
          defaultValue={currentEmail}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-slate-400">
          변경하지 않으려면 그대로 두세요.
        </p>
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
