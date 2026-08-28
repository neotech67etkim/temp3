"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { orgDb } from "@/lib/db";
import { auth } from "@/auth";
import { canManageOrg } from "@/lib/org-access";
import { resyncOrgToOpenDivisions } from "@/lib/division-db";
import { queryAllDivisions } from "@/lib/multi-division-query";
import { getDataDir } from "@/lib/app-config";
import { exportOrgForCopilot } from "@/lib/copilot-export";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !canManageOrg(session.user.role)) {
    throw new Error("조직 관리 권한이 없습니다.");
  }
  return session.user;
}

/**
 * 조직도가 바뀔 때마다(부서/과/팀/사용자 추가·삭제) Copilot용 조직도 문서도
 * 같이 갱신하고, 이미 열려 있는 과 파일들의 조직도 미러도 최신으로 맞춘다.
 * 둘 다 실패해도 방금 끝난 실제 조직 변경에는 영향이 없어야 하므로 에러는
 * 콘솔에만 남긴다.
 */
function syncOrgExport(): void {
  void exportOrgForCopilot(orgDb, getDataDir()).catch((err) => {
    console.error("[copilot-export] 조직도 내보내기 실패:", err);
  });
  void resyncOrgToOpenDivisions().catch((err) => {
    console.error("[org-sync] 열린 과 파일에 조직도 반영 실패:", err);
  });
}

export async function createDepartment(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("부서명을 입력하세요.");
  await orgDb.department.create({ data: { name } });
  syncOrgExport();
  revalidatePath("/org");
}

export async function createDivision(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const departmentId = String(formData.get("departmentId") ?? "");
  if (!name || !departmentId) throw new Error("과 이름과 소속 부서를 입력하세요.");
  await orgDb.division.create({ data: { name, departmentId } });
  syncOrgExport();
  revalidatePath("/org");
}

export async function createTeam(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const divisionId = String(formData.get("divisionId") ?? "");
  if (!name || !divisionId) throw new Error("팀 이름과 소속 과를 입력하세요.");
  await orgDb.team.create({ data: { name, divisionId } });
  syncOrgExport();
  revalidatePath("/org");
}

export async function createUser(formData: FormData) {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "MEMBER") as Role;
  const departmentId = (formData.get("departmentId") as string) || null;
  const divisionId = (formData.get("divisionId") as string) || null;
  // 팀은 팀장(TEAM_LEAD)만 소속시킨다. 과원(MEMBER 등)은 과 단위까지만 소속된다.
  const teamId =
    role === "TEAM_LEAD" ? (formData.get("teamId") as string) || null : null;

  if (!email || !name || !password) {
    throw new Error("이메일, 이름, 비밀번호를 입력하세요.");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await orgDb.user.create({
    data: {
      email,
      name,
      passwordHash,
      role,
      departmentId,
      divisionId,
      teamId,
    },
  });
  syncOrgExport();
  revalidatePath("/org");
}

export async function deleteDepartment(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("잘못된 요청입니다.");
  await orgDb.department.delete({ where: { id } });
  syncOrgExport();
  revalidatePath("/org");
}

export async function deleteDivision(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("잘못된 요청입니다.");
  await orgDb.division.delete({ where: { id } });
  syncOrgExport();
  revalidatePath("/org");
}

export async function deleteTeam(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("잘못된 요청입니다.");
  await orgDb.team.delete({ where: { id } });
  syncOrgExport();
  revalidatePath("/org");
}

export async function deleteUser(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("잘못된 요청입니다.");
  if (id === admin.id) throw new Error("본인 계정은 삭제할 수 없습니다.");

  // WorkOrder는 org.db가 아니라 각 과 파일에 있으므로, 전체 과 파일을 훑어서
  // 이 사용자가 어딘가에 업무를 만든 적이 있는지 확인해야 한다.
  const divisions = await orgDb.division.findMany({ select: { name: true } });
  const counts = await queryAllDivisions(
    divisions.map((d) => d.name),
    (client) => client.workOrder.count({ where: { createdById: id } }),
  );
  const totalCreated = counts.reduce((sum, r) => sum + r.value, 0);

  if (totalCreated > 0) {
    throw new Error(
      "이 사용자가 생성한 Work Order가 있어 삭제할 수 없습니다. 먼저 관련 업무를 다른 담당자에게 이관하세요.",
    );
  }

  await orgDb.user.delete({ where: { id } });
  syncOrgExport();
  revalidatePath("/org");
}
