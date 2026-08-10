"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AssigneeType, Priority, WorkOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { canManageWorkOrders } from "@/lib/org-access";

async function requireManager() {
  const session = await auth();
  if (!session?.user || !canManageWorkOrders(session.user.role)) {
    throw new Error("업무를 생성하거나 할당할 권한이 없습니다.");
  }
  return session.user;
}

const ASSIGNEE_FIELD: Record<AssigneeType, string> = {
  DEPARTMENT: "assignedDeptId",
  DIVISION: "assignedDivId",
  TEAM: "assignedTeamId",
  USER: "assignedUserId",
};

export async function createWorkOrder(formData: FormData) {
  const user = await requireManager();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const projectId = String(formData.get("projectId") ?? "");
  const parentId = (formData.get("parentId") as string) || null;
  const assigneeType = formData.get("assigneeType") as AssigneeType;
  const assigneeId = String(formData.get("assigneeId") ?? "");
  const dueDateRaw = formData.get("dueDate") as string | null;
  const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;
  const priority = (formData.get("priority") as Priority) || Priority.NORMAL;

  if (!title || !projectId || !assigneeType || !assigneeId) {
    throw new Error("제목, 프로젝트, 할당 대상을 모두 입력하세요.");
  }

  await prisma.workOrder.create({
    data: {
      title,
      description,
      projectId,
      parentId,
      assigneeType,
      dueDate,
      priority,
      createdById: user.id,
      [ASSIGNEE_FIELD[assigneeType]]: assigneeId,
    },
  });

  revalidatePath("/work-orders");
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${projectId}`);
  if (parentId) revalidatePath(`/work-orders/${parentId}`);

  redirect(`/projects/${projectId}`);
}

export async function updateWorkOrderStatus(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("로그인이 필요합니다.");

  const status = formData.get("status") as WorkOrderStatus;

  const workOrder = await prisma.workOrder.update({
    where: { id },
    data: { status },
  });

  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
  revalidatePath(`/projects/${workOrder.projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/my-tasks");
}

export async function updateWorkOrderProgress(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("로그인이 필요합니다.");

  const progress = Number(formData.get("progress"));
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));
  const status: WorkOrderStatus =
    clamped === 100
      ? WorkOrderStatus.COMPLETED
      : clamped === 0
        ? WorkOrderStatus.NOT_STARTED
        : WorkOrderStatus.IN_PROGRESS;

  const workOrder = await prisma.workOrder.update({
    where: { id },
    data: { progress: clamped, status },
  });

  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
  revalidatePath(`/projects/${workOrder.projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/my-tasks");
}

export async function updateWorkOrderPriority(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("로그인이 필요합니다.");

  const priority = formData.get("priority") as Priority;

  const workOrder = await prisma.workOrder.update({
    where: { id },
    data: { priority },
  });

  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
  revalidatePath(`/projects/${workOrder.projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/my-tasks");
}

export async function updateWorkOrderDetails(id: string, formData: FormData) {
  await requireManager();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const dueDateRaw = formData.get("dueDate") as string | null;
  const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;

  if (!title) throw new Error("제목을 입력하세요.");

  const workOrder = await prisma.workOrder.update({
    where: { id },
    data: { title, description, dueDate },
  });

  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
  revalidatePath(`/projects/${workOrder.projectId}`);
  revalidatePath("/dashboard");
}

export async function deleteWorkOrder(formData: FormData) {
  await requireManager();

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("잘못된 요청입니다.");

  const workOrder = await prisma.workOrder.delete({ where: { id } });

  revalidatePath("/work-orders");
  revalidatePath("/dashboard");
  revalidatePath("/my-tasks");
  revalidatePath(`/projects/${workOrder.projectId}`);
  if (workOrder.parentId) revalidatePath(`/work-orders/${workOrder.parentId}`);
  redirect(`/projects/${workOrder.projectId}`);
}

export async function createProject(formData: FormData) {
  const user = await requireManager();
  void user;

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const categoryId = (formData.get("categoryId") as string) || null;

  if (!name) throw new Error("프로젝트명을 입력하세요.");

  await prisma.project.create({
    data: { name, description, categoryId },
  });

  revalidatePath("/projects");
  revalidatePath("/dashboard");
}

export async function createCategory(formData: FormData) {
  await requireManager();

  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim() || null;

  if (!name) throw new Error("카테고리명을 입력하세요.");

  await prisma.category.create({ data: { name, color } });

  revalidatePath("/projects");
  revalidatePath("/dashboard");
}
