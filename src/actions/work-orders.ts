"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AssigneeType, Priority, WorkOrderStatus, type PrismaClient } from "@prisma/client";
import { orgDb } from "@/lib/db";
import { getDivisionDb } from "@/lib/division-db";
import { auth } from "@/auth";
import {
  assignableTypesFor,
  assignableUsersWhere,
  canManageWorkOrders,
  editableDivisionKeysFor,
  workOrderScopeWhere,
  type ScopedUser,
} from "@/lib/org-access";
import { getDataDir } from "@/lib/app-config";
import { exportDivisionForCopilot } from "@/lib/copilot-export";
import {
  DEPT_COMMON_KEY,
  allStoreKeys,
  deleteWorkOrderCascade,
  findWorkOrderById,
  updateDescendantsProjectId,
} from "@/lib/work-order-tree";

async function allDivisionKeys(): Promise<string[]> {
  const divisions = await orgDb.division.findMany({ select: { name: true } });
  return allStoreKeys(divisions.map((d) => d.name));
}

/** 이 사용자가 이 과 파일을 건드릴 권한이 있는지 확인한다(부서장은 소속 부서
 *  전체+부서공통, 과장/팀장/과원은 자기 과만). */
async function assertEditableDivision(user: ScopedUser, key: string): Promise<void> {
  const allDivisions = await orgDb.division.findMany({
    select: { id: true, name: true, departmentId: true },
  });
  const allowed = editableDivisionKeysFor(user, allDivisions, DEPT_COMMON_KEY);
  if (!allowed.some((o) => o.key === key)) {
    throw new Error(`"${key}"를 수정할 권한이 없습니다.`);
  }
}

/** id로 업무를 찾아 그 업무가 저장된 과 키를 돌려준다. 없으면 에러. */
async function locateOrThrow(id: string): Promise<string> {
  const located = await findWorkOrderById(await allDivisionKeys(), id);
  if (!located) throw new Error("해당 업무를 찾을 수 없습니다.");
  return located.key;
}

/** 이 업무가 사용자의 권한 범위(관리 범위 또는 본인 담당) 안에 있는지 확인하고 돌려준다. */
async function requireScopedWorkOrder(client: PrismaClient, id: string, user: ScopedUser) {
  const workOrder = await client.workOrder.findFirst({
    where: { id, ...workOrderScopeWhere(user) },
  });
  if (!workOrder) throw new Error("이 업무를 수정할 권한이 없습니다.");
  return workOrder;
}

/** 할당 대상(assigneeType/assigneeId)이 물리적으로 저장되어야 할 과 파일 키를 계산한다. */
async function resolveTargetDivisionKey(
  assigneeType: AssigneeType,
  assigneeId: string,
): Promise<string | null> {
  switch (assigneeType) {
    case AssigneeType.DEPARTMENT:
      return DEPT_COMMON_KEY;
    case AssigneeType.DIVISION: {
      const div = await orgDb.division.findUnique({ where: { id: assigneeId } });
      return div?.name ?? null;
    }
    case AssigneeType.TEAM: {
      const team = await orgDb.team.findUnique({
        where: { id: assigneeId },
        include: { division: true },
      });
      return team?.division.name ?? null;
    }
    case AssigneeType.USER: {
      const target = await orgDb.user.findUnique({ where: { id: assigneeId } });
      return target?.divisionId
        ? (await orgDb.division.findUnique({ where: { id: target.divisionId } }))?.name ?? null
        : DEPT_COMMON_KEY;
    }
    default:
      return null;
  }
}

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

/**
 * 이 과의 업무 현황/변경 이력 Markdown 문서를 Copilot(사내 M365)이 읽을 수
 * 있도록 갱신한다. 실패해도 방금 끝난 실제 저장에는 영향이 없어야 하므로,
 * 에러는 콘솔에만 남기고 액션 자체는 그대로 성공 처리한다.
 */
function refreshCopilotExport(key: string): void {
  void getDivisionDb(key)
    .then((client) => exportDivisionForCopilot(client, key, getDataDir()))
    .catch((err) => {
      console.error(`[copilot-export] "${key}" 내보내기 실패:`, err);
    });
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

  const targetKey = await resolveTargetDivisionKey(assigneeType, assigneeId);
  if (!targetKey) throw new Error("할당 대상을 찾을 수 없습니다.");
  await assertEditableDivision(user, targetKey);

  if (assigneeType === AssigneeType.USER) {
    const assignable = await orgDb.user.findFirst({
      where: { id: assigneeId, ...assignableUsersWhere(user) },
      select: { id: true },
    });
    if (!assignable) {
      throw new Error("할당 권한이 없는 대상입니다.");
    }
  }

  const client = await getDivisionDb(targetKey);
  await client.workOrder.create({
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
  refreshCopilotExport(targetKey);

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

  const targetKey = session.user.divisionId
    ? (await orgDb.division.findUnique({ where: { id: session.user.divisionId } }))?.name ??
      null
    : DEPT_COMMON_KEY;
  if (!targetKey) throw new Error("소속 과를 확인할 수 없습니다.");
  await assertEditableDivision(session.user, targetKey);

  const client = await getDivisionDb(targetKey);
  await client.workOrder.create({
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
  refreshCopilotExport(targetKey);

  revalidatePath("/dashboard");
}

export async function updateWorkOrderStatus(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("로그인이 필요합니다.");

  const targetKey = await locateOrThrow(id);
  const client = await getDivisionDb(targetKey);
  await requireScopedWorkOrder(client, id, session.user);

  const status = formData.get("status") as WorkOrderStatus;

  const workOrder = await client.workOrder.update({
    where: { id },
    data: {
      status,
      completedAt: status === WorkOrderStatus.COMPLETED ? new Date() : null,
    },
  });
  refreshCopilotExport(targetKey);

  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
  revalidatePath(`/projects/${workOrder.projectId}`);
  revalidatePath("/dashboard");
}

export async function updateWorkOrderProgress(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("로그인이 필요합니다.");

  const targetKey = await locateOrThrow(id);
  const client = await getDivisionDb(targetKey);
  await requireScopedWorkOrder(client, id, session.user);

  const progress = Number(formData.get("progress"));
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));
  const status: WorkOrderStatus =
    clamped === 100
      ? WorkOrderStatus.COMPLETED
      : clamped === 0
        ? WorkOrderStatus.NOT_STARTED
        : WorkOrderStatus.IN_PROGRESS;

  const workOrder = await client.workOrder.update({
    where: { id },
    data: {
      progress: clamped,
      status,
      completedAt: status === WorkOrderStatus.COMPLETED ? new Date() : null,
    },
  });
  refreshCopilotExport(targetKey);

  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
  revalidatePath(`/projects/${workOrder.projectId}`);
  revalidatePath("/dashboard");
}

/**
 * 담당자가 진행관련 정보 및 질문(텍스트/스크린샷/참고 파일 경로)을 남긴다.
 * 담당자 본인이 아니어도, 그 업무가 속한 과 소속이면 누구나 남길 수 있다
 * (진행 상황을 묻거나 참고할 내용을 공유하는 용도이기 때문).
 */
export async function addWorkOrderLog(workOrderId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("로그인이 필요합니다.");

  const targetKey = await locateOrThrow(workOrderId);
  await assertEditableDivision(session.user, targetKey);
  const client = await getDivisionDb(targetKey);

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
    // public/ 안에 두지 않는다 - next start의 정적 서빙은 서버 시작 시점에
    // 이미 있던 파일만 인식해서, 서버가 떠 있는 동안 새로 올린 스크린샷은
    // 재시작 전까지 404가 난다. 대신 /api/uploads 라우트가 매 요청마다
    // 직접 파일을 읽어서 내려준다(src/app/api/uploads/[...path]/route.ts).
    const dir = path.join(process.cwd(), "uploads", "work-orders", workOrderId);
    await mkdir(dir, { recursive: true });
    const buffer = Buffer.from(await image.arrayBuffer());
    await writeFile(path.join(dir, filename), buffer);
    imagePath = `/api/uploads/work-orders/${workOrderId}/${filename}`;
  }

  if (!note && !filePath && !imagePath) {
    throw new Error("진행 내용을 입력하거나 스크린샷/파일 경로를 첨부하세요.");
  }

  const workOrder = await client.workOrder.findUniqueOrThrow({
    where: { id: workOrderId },
    select: { progress: true },
  });

  await client.workOrderLog.create({
    data: {
      workOrderId,
      authorId: session.user.id,
      note: note || null,
      filePath,
      imagePath,
      progress: workOrder.progress,
    },
  });
  refreshCopilotExport(targetKey);

  revalidatePath(`/work-orders/${workOrderId}`);
}

export async function updateWorkOrderPriority(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("로그인이 필요합니다.");

  const targetKey = await locateOrThrow(id);
  const client = await getDivisionDb(targetKey);
  await requireScopedWorkOrder(client, id, session.user);

  const priority = formData.get("priority") as Priority;

  const workOrder = await client.workOrder.update({
    where: { id },
    data: { priority },
  });
  refreshCopilotExport(targetKey);

  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
  revalidatePath(`/projects/${workOrder.projectId}`);
  revalidatePath("/dashboard");
}

/** 개인에게 할당된 업무를 내 권한 범위 안의 다른 사람에게 이관한다. */
export type ReassignState = { message: string } | undefined;

export async function reassignWorkOrder(
  id: string,
  _prevState: ReassignState,
  formData: FormData,
): Promise<ReassignState> {
  const session = await auth();
  if (!session?.user || !canManageWorkOrders(session.user.role)) {
    throw new Error("업무를 이관할 권한이 없습니다.");
  }

  const targetKey = await locateOrThrow(id);
  const client = await getDivisionDb(targetKey);

  const newAssigneeId = String(formData.get("assigneeId") ?? "");
  if (!newAssigneeId) throw new Error("이관할 담당자를 선택하세요.");

  const workOrder = await client.workOrder.findFirst({
    where: { id, ...workOrderScopeWhere(session.user) },
    include: {
      assignedUser: { select: { name: true } },
      assignedDept: { select: { name: true } },
      assignedDiv: { select: { name: true } },
    },
  });
  if (!workOrder) throw new Error("이관 권한이 없는 업무입니다.");

  const ownsOrgAssignment =
    session.user.role === "ADMIN" ||
    (workOrder.assigneeType === AssigneeType.DEPARTMENT &&
      session.user.role === "DEPT_HEAD" &&
      workOrder.assignedDeptId === session.user.departmentId) ||
    (workOrder.assigneeType === AssigneeType.DIVISION &&
      session.user.role === "DIV_HEAD" &&
      workOrder.assignedDivId === session.user.divisionId);

  if (workOrder.assigneeType !== AssigneeType.USER && !ownsOrgAssignment) {
    throw new Error(
      "본인이 담당하는 조직 단위로 할당된 업무이거나 개인에게 할당된 업무만 지정/이관할 수 있습니다.",
    );
  }

  if (
    workOrder.assigneeType === AssigneeType.USER &&
    newAssigneeId === workOrder.assignedUserId
  ) {
    return { message: "이미 해당 담당자입니다." };
  }

  const target = await orgDb.user.findFirst({
    where: { id: newAssigneeId, ...assignableUsersWhere(session.user) },
    select: { id: true, name: true },
  });
  if (!target) throw new Error("이관 권한이 없는 대상입니다.");

  const fromLabel =
    workOrder.assignedUser?.name ??
    workOrder.assignedDiv?.name ??
    workOrder.assignedDept?.name ??
    "미지정";

  await client.$transaction([
    client.workOrder.update({
      where: { id },
      data: {
        assigneeType: AssigneeType.USER,
        assignedUserId: target.id,
        assignedDeptId: null,
        assignedDivId: null,
        assignedTeamId: null,
        transferred: true,
      },
    }),
    client.workOrderLog.create({
      data: {
        workOrderId: id,
        authorId: session.user.id,
        note: `담당자를 ${fromLabel}에서 ${target.name}님으로 지정/이관했습니다.`,
      },
    }),
  ]);
  refreshCopilotExport(targetKey);

  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
  revalidatePath("/dashboard");

  return { message: `${target.name}님에게 이관되었습니다.` };
}

export async function updateWorkOrderDetails(id: string, formData: FormData) {
  const user = await requireManager();

  const targetKey = await locateOrThrow(id);
  const client = await getDivisionDb(targetKey);
  await requireScopedWorkOrder(client, id, user);

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const dueDateRaw = formData.get("dueDate") as string | null;
  const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;
  const projectId = String(formData.get("projectId") ?? "");

  if (!title) throw new Error("제목을 입력하세요.");
  if (!projectId) throw new Error("프로젝트를 선택하세요.");

  const current = await client.workOrder.findUniqueOrThrow({
    where: { id },
    select: { projectId: true, parentId: true },
  });
  const projectChanged = projectId !== current.projectId;

  if (projectChanged) {
    await updateDescendantsProjectId(await allDivisionKeys(), id, projectId);
  }

  const workOrder = await client.workOrder.update({
    where: { id },
    data: {
      title,
      description,
      dueDate,
      projectId,
      // 프로젝트가 바뀌면 기존 상위 업무와 프로젝트가 어긋나므로 상위 연결을 해제한다.
      parentId: projectChanged ? null : undefined,
    },
  });
  refreshCopilotExport(targetKey);

  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
  revalidatePath(`/projects/${workOrder.projectId}`);
  if (projectChanged) {
    revalidatePath(`/projects/${current.projectId}`);
    if (current.parentId) revalidatePath(`/work-orders/${current.parentId}`);
  }
  revalidatePath("/dashboard");
}

export async function deleteWorkOrder(formData: FormData) {
  const user = await requireManager();

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("잘못된 요청입니다.");

  const divisionKeys = await allDivisionKeys();
  const located = await findWorkOrderById(divisionKeys, id);
  if (!located) throw new Error("삭제할 업무를 찾을 수 없습니다.");
  const { projectId, parentId } = located.workOrder;

  const client = await getDivisionDb(located.key);
  await requireScopedWorkOrder(client, id, user);

  await deleteWorkOrderCascade(divisionKeys, id);

  revalidatePath("/work-orders");
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${projectId}`);
  if (parentId) revalidatePath(`/work-orders/${parentId}`);
  redirect(`/projects/${projectId}`);
}

export async function createProject(formData: FormData) {
  await requireManager();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const categoryId = (formData.get("categoryId") as string) || null;

  if (!name) throw new Error("프로젝트명을 입력하세요.");

  // Project는 division 파일이 아니라 조직 원본(org.db)에 저장한다.
  await orgDb.project.create({
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

  await orgDb.category.create({ data: { name, color } });

  revalidatePath("/projects");
  revalidatePath("/dashboard");
}
