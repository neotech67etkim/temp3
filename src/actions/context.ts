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

  // 이 프로세스(=이 PC의 프로그램)에 이미 다른 사람의 편집 세션이 열려 있으면
  // 새 편집 세션을 시작할 수 없다. 편집 활성 클라이언트는 프로세스 전역
  // 상태라서, 여기서 새로 열어버리면 그 사람의 편집 세션 연결이 그대로
  // 끊겨(파일 잠금은 남은 채) 저장도 취소도 할 수 없는 상태로 방치된다.
  // 실제 배포(PC 1대 = 사용자 1명)에서는 애초에 벌어지지 않는 상황이지만,
  // 한 PC/브라우저에서 계정을 바꿔가며 쓰는 경우를 안전하게 막아준다.
  const current = getActiveContextInfo();
  if (
    current &&
    current.mode === "edit" &&
    current.holder.email !== session.user.email
  ) {
    return `지금 이 프로그램은 ${current.holder.name}님이 "${current.key}"를 편집 중입니다. 그분이 저장하거나 취소해서 편집을 마친 뒤 다시 시도해주세요.`;
  }

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
  if (info.holder.email !== session.user.email) {
    throw new Error(
      `이 편집 세션은 ${info.holder.name}님이 시작했습니다. 본인이 시작한 편집만 저장/취소할 수 있습니다.`,
    );
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
