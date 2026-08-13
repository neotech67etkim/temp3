"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AssigneeType, Priority, WorkOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import {
  assignableTypesFor,
  assignableUsersWhere,
  canManageWorkOrders,
  workOrderScopeWhere,
} from "@/lib/org-access";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

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

  if (!assignableTypesFor(user.role).includes(assigneeType)) {
    throw new Error("해당 단위로 할당할 권한이 없습니다.");
  }

  if (assigneeType === AssigneeType.USER) {
    const assignable = await prisma.user.findFirst({
      where: { id: assigneeId, ...assignableUsersWhere(user) },
      select: { id: true },
    });
    if (!assignable) {
      throw new Error("할당 권한이 없는 대상입니다.");
    }
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

/** 자기 자신에게 할당되는 개인 할일을 만든다(내 할일). */
export async function createMyTodo(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("로그인이 필요합니다.");

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const projectId = String(formData.get("projectId") ?? "");
  const dueDateRaw = formData.get("dueDate") as string | null;
  const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;
  const priority = (formData.get("priority") as Priority) || Priority.NORMAL;

  if (!title || !projectId) {
    throw new Error("제목과 프로젝트를 입력하세요.");
  }

  await prisma.workOrder.create({
    data: {
      title,
      description,
      projectId,
      assigneeType: AssigneeType.USER,
      assignedUserId: session.user.id,
      dueDate,
      priority,
      createdById: session.user.id,
    },
  });

  revalidatePath("/work-list");
  revalidatePath("/dashboard");
}

export async function updateWorkOrderStatus(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("로그인이 필요합니다.");

  const status = formData.get("status") as WorkOrderStatus;

  const workOrder = await prisma.workOrder.update({
    where: { id },
    data: {
      status,
      completedAt: status === WorkOrderStatus.COMPLETED ? new Date() : null,
    },
  });

  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
  revalidatePath(`/projects/${workOrder.projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/work-list");
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
    data: {
      progress: clamped,
      status,
      completedAt: status === WorkOrderStatus.COMPLETED ? new Date() : null,
    },
  });

  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
  revalidatePath(`/projects/${workOrder.projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/work-list");
}

/** 담당자가 진행 경과(텍스트/스크린샷/참고 파일 경로)를 남긴다. */
export async function addWorkOrderLog(workOrderId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("로그인이 필요합니다.");

  const note = String(formData.get("note") ?? "").trim();
  const filePath = String(formData.get("filePath") ?? "").trim() || null;
  const image = formData.get("image");

  let imagePath: string | null = null;
  if (image instanceof File && image.size > 0) {
    if (image.size > MAX_IMAGE_BYTES) {
      throw new Error("이미지 용량은 8MB 이하만 첨부할 수 있습니다.");
    }
    if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
      throw new Error("이미지 파일(PNG/JPEG/WEBP/GIF)만 첨부할 수 있습니다.");
    }
    const ext = path.extname(image.name) || ".png";
    const filename = `${randomUUID()}${ext}`;
    const dir = path.join(process.cwd(), "public", "uploads", "work-orders", workOrderId);
    await mkdir(dir, { recursive: true });
    const buffer = Buffer.from(await image.arrayBuffer());
    await writeFile(path.join(dir, filename), buffer);
    imagePath = `/uploads/work-orders/${workOrderId}/${filename}`;
  }

  if (!note && !filePath && !imagePath) {
    throw new Error("진행 내용을 입력하거나 스크린샷/파일 경로를 첨부하세요.");
  }

  const workOrder = await prisma.workOrder.findUniqueOrThrow({
    where: { id: workOrderId },
    select: { progress: true },
  });

  await prisma.workOrderLog.create({
    data: {
      workOrderId,
      authorId: session.user.id,
      note: note || null,
      filePath,
      imagePath,
      progress: workOrder.progress,
    },
  });

  revalidatePath(`/work-orders/${workOrderId}`);
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
  revalidatePath("/work-list");
}

/** 개인에게 할당된 업무를 내 권한 범위 안의 다른 사람에게 이관한다. */
export async function reassignWorkOrder(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user || !canManageWorkOrders(session.user.role)) {
    throw new Error("업무를 이관할 권한이 없습니다.");
  }

  const newAssigneeId = String(formData.get("assigneeId") ?? "");
  if (!newAssigneeId) throw new Error("이관할 담당자를 선택하세요.");

  const workOrder = await prisma.workOrder.findFirst({
    where: { id, ...workOrderScopeWhere(session.user) },
    include: { assignedUser: { select: { name: true } } },
  });
  if (!workOrder) throw new Error("이관 권한이 없는 업무입니다.");

  if (workOrder.assigneeType !== AssigneeType.USER) {
    throw new Error("개인에게 할당된 업무만 이관할 수 있습니다.");
  }

  if (newAssigneeId === workOrder.assignedUserId) return;

  const target = await prisma.user.findFirst({
    where: { id: newAssigneeId, ...assignableUsersWhere(session.user) },
    select: { id: true, name: true },
  });
  if (!target) throw new Error("이관 권한이 없는 대상입니다.");

  await prisma.$transaction([
    prisma.workOrder.update({
      where: { id },
      data: { assignedUserId: target.id, transferred: true },
    }),
    prisma.workOrderLog.create({
      data: {
        workOrderId: id,
        authorId: session.user.id,
        note: `담당자를 ${workOrder.assignedUser?.name ?? "미지정"}님에서 ${target.name}님으로 이관했습니다.`,
      },
    }),
  ]);

  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
  revalidatePath("/work-list");
  revalidatePath("/dashboard");
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
  revalidatePath("/work-list");
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

  if (!name) throw new Error("업무영역명을 입력하세요.");

  await prisma.category.create({ data: { name, color } });

  revalidatePath("/projects");
  revalidatePath("/dashboard");
}
