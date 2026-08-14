"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { orgDb } from "@/lib/db";
import { getActiveContextInfo } from "@/lib/db";
import { ActiveContext } from "@/lib/active-context";
import { getNasStore, getMigrationsDir } from "@/lib/app-config";
import { DEPT_COMMON_KEY } from "@/lib/work-order-tree";
import { editableDivisionKeysFor } from "@/lib/org-access";

function buildContext() {
  return new ActiveContext(getNasStore(), getMigrationsDir());
}

export async function startEditSession(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const session = await auth();
  if (!session?.user) return "로그인이 필요합니다.";

  const key = String(formData.get("key") ?? "");
  const force = formData.get("force") === "on";
  if (!key) return "편집할 과를 선택하세요.";

  const allDivisions = await orgDb.division.findMany({
    select: { id: true, name: true, departmentId: true },
  });
  const allowed = editableDivisionKeysFor(session.user, allDivisions, DEPT_COMMON_KEY);
  if (!allowed.some((o) => o.key === key)) {
    return "이 과를 편집할 권한이 없습니다.";
  }

  const ctx = buildContext();
  const result = await ctx.openForEdit(
    key,
    { name: session.user.name ?? session.user.email ?? "", email: session.user.email ?? "" },
    { force },
  );

  if (!result.ok) {
    if (result.reason === "stale") {
      return `"${key}"는 ${result.lock.holderName}님이 오래 전(응답 없음)에 편집을 시작한 상태로 남아있습니다. 강제로 이어받으려면 아래 체크박스를 선택하고 다시 시도하세요.`;
    }
    return `지금 "${key}"는 ${result.lock.holderName}님이 편집 중입니다. 잠시 후 다시 시도하거나, 보기 전용으로 화면을 확인하세요.`;
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function endEditSession(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("로그인이 필요합니다.");

  const mode = String(formData.get("mode") ?? "save");
  const info = getActiveContextInfo();
  if (!info) {
    redirect("/select-division");
  }

  const ctx = buildContext();
  if (mode === "discard") {
    ctx.discardAndClose(info.key);
  } else {
    ctx.saveAndClose(info.key);
  }

  revalidatePath("/", "layout");
  redirect("/select-division");
}
