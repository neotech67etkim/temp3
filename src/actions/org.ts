"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { canManageOrg } from "@/lib/org-access";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !canManageOrg(session.user.role)) {
    throw new Error("조직 관리 권한이 없습니다.");
  }
  return session.user;
}

export async function createDepartment(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("부서명을 입력하세요.");
  await prisma.department.create({ data: { name } });
  revalidatePath("/org");
}

export async function createDivision(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const departmentId = String(formData.get("departmentId") ?? "");
  if (!name || !departmentId) throw new Error("과 이름과 소속 부서를 입력하세요.");
  await prisma.division.create({ data: { name, departmentId } });
  revalidatePath("/org");
}

export async function createTeam(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const divisionId = String(formData.get("divisionId") ?? "");
  if (!name || !divisionId) throw new Error("팀 이름과 소속 과를 입력하세요.");
  await prisma.team.create({ data: { name, divisionId } });
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
  await prisma.user.create({
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
  revalidatePath("/org");
}

export async function deleteDepartment(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("잘못된 요청입니다.");
  await prisma.department.delete({ where: { id } });
  revalidatePath("/org");
}

export async function deleteDivision(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("잘못된 요청입니다.");
  await prisma.division.delete({ where: { id } });
  revalidatePath("/org");
}

export async function deleteTeam(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("잘못된 요청입니다.");
  await prisma.team.delete({ where: { id } });
  revalidatePath("/org");
}

export async function deleteUser(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("잘못된 요청입니다.");
  if (id === admin.id) throw new Error("본인 계정은 삭제할 수 없습니다.");

  const createdCount = await prisma.workOrder.count({
    where: { createdById: id },
  });
  if (createdCount > 0) {
    throw new Error(
      "이 사용자가 생성한 Work Order가 있어 삭제할 수 없습니다. 먼저 관련 업무를 다른 담당자에게 이관하세요.",
    );
  }

  await prisma.user.delete({ where: { id } });
  revalidatePath("/org");
}
