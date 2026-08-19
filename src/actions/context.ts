"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { orgDb, getActiveContextInfo, setUnavailableDivisions } from "@/lib/db";
import { ActiveContext, switchCurrentDivision, isDivisionHeld } from "@/lib/active-context";
import { getNasStore, getMigrationsDir } from "@/lib/app-config";
import { DEPT_COMMON_KEY } from "@/lib/work-order-tree";
import { editableDivisionKeysFor } from "@/lib/org-access";

function buildContext() {
  return new ActiveContext(getNasStore(), getMigrationsDir());
}

/** returnTo가 우리 앱 안의 상대 경로인지 확인한다(오픈 리다이렉트 방지). */
function safeReturnPath(raw: string | undefined): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/dashboard";
}

export async function startEditSession(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const session = await auth();
  if (!session?.user) return "로그인이 필요합니다.";

  const key = String(formData.get("key") ?? "");
  // 특정 Work Order 화면에서 "바로 이 업무 편집하러 가기"로 시작한 경우, 성공하면
  // /select-division/dashboard가 아니라 그 화면으로 바로 돌려보낸다.
  const returnTo = safeReturnPath(formData.get("returnTo") as string | null ?? undefined);
  if (!key) return "편집할 과를 선택하세요.";

  // 이 프로세스(=이 PC의 프로그램)에 이미 다른 사람의 편집 세션이 열려 있으면
  // 새 편집 세션을 시작할 수 없다. 활성 상태는 프로세스 전역이라서, 여기서
  // 새로 열어버리면 그 사람의 편집 세션 연결이 그대로 끊겨(파일 잠금은 남은
  // 채) 저장도 취소도 할 수 없는 상태로 방치된다. 실제 배포(PC 1대 = 사용자
  // 1명)에서는 애초에 벌어지지 않는 상황이지만, 한 PC/브라우저에서 계정을
  // 바꿔가며 쓰는 경우를 안전하게 막아준다.
  const current = getActiveContextInfo();
  if (
    current &&
    current.mode === "edit" &&
    current.holder.email !== session.user.email
  ) {
    return `지금 이 프로그램은 ${current.holder.name}님이 편집 중입니다. 그분이 저장하거나 취소해서 편집을 마친 뒤 다시 시도해주세요.`;
  }

  // 이미 내가 이 과를 들고 있으면(예: "전체 편집 시작" 뒤 개별 업무에서 다시
  // 누른 경우) 새로 열 필요 없이 그 화면으로 바로 이동한다.
  if (current && isDivisionHeld(key)) {
    switchCurrentDivision(key);
    redirect(returnTo);
  }

  const allDivisions = await orgDb.division.findMany({
    select: { id: true, name: true, departmentId: true },
  });
  const allowed = editableDivisionKeysFor(session.user, allDivisions, DEPT_COMMON_KEY);
  if (!allowed.some((o) => o.key === key)) {
    return "이 과를 편집할 권한이 없습니다.";
  }

  const ctx = buildContext();
  const result = await ctx.openForEdit(key, {
    name: session.user.name ?? session.user.email ?? "",
    email: session.user.email ?? "",
  });

  if (!result.ok) {
    return `지금 "${key}"는 ${result.lock.holderName}님이 편집 중입니다. 잠시 후 다시 시도하거나, 보기 전용으로 화면을 확인하세요.`;
  }

  revalidatePath("/", "layout");
  redirect(returnTo);
}

/**
 * 편집 권한이 있는 과 전체(부서장이면 소속 부서 전체 + 부서 공통, 과장이면
 * 자기 과 하나)를 한 번에 편집 모드로 연다. 몇 개 과는 이미 다른 사람이
 * 편집 중이어도 나머지는 그대로 열리고, 못 연 과 목록은 setUnavailableDivisions로
 * 기록해서 select-division/nav 화면에 "OOO가 편집중입니다"로 보여준다.
 */
export async function startEditSessionAll(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const session = await auth();
  if (!session?.user) return "로그인이 필요합니다.";

  const returnTo = safeReturnPath(formData.get("returnTo") as string | null ?? undefined);

  const current = getActiveContextInfo();
  if (
    current &&
    current.mode === "edit" &&
    current.holder.email !== session.user.email
  ) {
    return `지금 이 프로그램은 ${current.holder.name}님이 편집 중입니다. 그분이 저장하거나 취소해서 편집을 마친 뒤 다시 시도해주세요.`;
  }

  const allDivisions = await orgDb.division.findMany({
    select: { id: true, name: true, departmentId: true },
  });
  const allowed = editableDivisionKeysFor(session.user, allDivisions, DEPT_COMMON_KEY);
  const alreadyHeld = new Set(current?.keys ?? []);
  const toOpen = allowed.map((o) => o.key).filter((k) => !alreadyHeld.has(k));

  const holder = {
    name: session.user.name ?? session.user.email ?? "",
    email: session.user.email ?? "",
  };
  const ctx = buildContext();
  const { failed } = await ctx.openManyForEdit(toOpen, holder);

  setUnavailableDivisions(
    failed.map((f) => ({ key: f.key, holderName: f.lock.holderName })),
  );

  revalidatePath("/", "layout");

  const nowHeld = getActiveContextInfo();
  if (!nowHeld) {
    return `지금 편집 가능한 과가 없습니다: ${failed
      .map((f) => `${f.key}(${f.lock.holderName}님이 편집 중)`)
      .join(", ")}`;
  }

  redirect(returnTo);
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
  // "한 번에 모두 처리": 지금 보유 중인 과를 전부 같이 저장/취소한다.
  if (mode === "discard") {
    ctx.discardAndCloseAll(info.keys);
  } else {
    ctx.saveAndCloseAll(info.keys);
  }
  setUnavailableDivisions([]);

  revalidatePath("/", "layout");
  redirect("/select-division");
}
