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
  const teamId = (formData.get("teamId") as string) || null;

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
