"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AssigneeType, Prisma, Priority, WorkOrderStatus } from "@prisma/client";
import { prisma, orgDb, getActiveContextInfo } from "@/lib/db";
import { auth } from "@/auth";
import {
  assignableTypesFor,
  assignableUsersWhere,
  canManageWorkOrders,
  workOrderScopeWhere,
} from "@/lib/org-access";
import { getNasStore, getMigrationsDir } from "@/lib/app-config";
import {
  DEPT_COMMON_KEY,
  allStoreKeys,
  deleteWorkOrderCascade,
  findWorkOrderById,
  updateDescendantsProjectId,
} from "@/lib/work-order-tree";

/** 지금 편집 세션이 열려 있는지 확인한다(없으면 /select-division으로 유도). */
function requireActiveEditSession(): void {
  const info = getActiveContextInfo();
  if (!info || info.mode !== "edit") {
    throw new Error(
      "지금 편집 중인 과가 없습니다. 화면 상단의 '편집 시작'에서 편집할 과를 먼저 선택하세요.",
    );
  }
}

/** id가 현재 편집 중인 과가 아니라 다른 과 파일에 있을 때 보여줄 안내 메시지를 만든다. */
async function wrongDivisionError(id: string): Promise<Error> {
  const store = getNasStore();
  const migrationsDir = getMigrationsDir();
  const divisions = await orgDb.division.findMany({ select: { name: true } });
  const divisionKeys = allStoreKeys(divisions.map((d) => d.name));
  const located = await findWorkOrderById(store, divisionKeys, migrationsDir, id);
  if (!located) return new Error("해당 업무를 찾을 수 없습니다.");
  return new Error(
    `이 업무는 "${located.key}"에 있습니다. 편집하려면 화면 상단 '편집 시작'에서 그 과를 먼저 선택하세요.`,
  );
}

function isRecordNotFound(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025"
  );
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

  requireActiveEditSession();
  const expectedKey = await resolveTargetDivisionKey(assigneeType, assigneeId);
  const activeKey = getActiveContextInfo()!.key;
  if (expectedKey && expectedKey !== activeKey) {
    throw new Error(
      `이 할당 대상은 "${expectedKey}"에 속합니다. 화면 상단 '편집 시작'에서 그 과를 먼저 선택하세요(현재: ${activeKey}).`,
    );
  }

  if (assigneeType === AssigneeType.USER) {
    const assignable = await orgDb.user.findFirst({
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

  requireActiveEditSession();
  const expectedKey = session.user.divisionId
    ? (await orgDb.division.findUnique({ where: { id: session.user.divisionId } }))?.name
    : DEPT_COMMON_KEY;
  const activeKey = getActiveContextInfo()!.key;
  if (expectedKey && expectedKey !== activeKey) {
    throw new Error(
      `내 할일은 "${expectedKey}"에 저장됩니다. 화면 상단 '편집 시작'에서 그 과를 먼저 선택하세요(현재: ${activeKey}).`,
    );
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

  revalidatePath("/dashboard");
}

export async function updateWorkOrderStatus(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("로그인이 필요합니다.");
  requireActiveEditSession();

  const status = formData.get("status") as WorkOrderStatus;

  let workOrder;
  try {
    workOrder = await prisma.workOrder.update({
      where: { id },
      data: {
        status,
        completedAt: status === WorkOrderStatus.COMPLETED ? new Date() : null,
      },
    });
  } catch (err) {
    if (isRecordNotFound(err)) throw await wrongDivisionError(id);
    throw err;
  }

  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
  revalidatePath(`/projects/${workOrder.projectId}`);
  revalidatePath("/dashboard");
}

export async function updateWorkOrderProgress(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("로그인이 필요합니다.");
  requireActiveEditSession();

  const progress = Number(formData.get("progress"));
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));
  const status: WorkOrderStatus =
    clamped === 100
      ? WorkOrderStatus.COMPLETED
      : clamped === 0
        ? WorkOrderStatus.NOT_STARTED
        : WorkOrderStatus.IN_PROGRESS;

  let workOrder;
  try {
    workOrder = await prisma.workOrder.update({
      where: { id },
      data: {
        progress: clamped,
        status,
        completedAt: status === WorkOrderStatus.COMPLETED ? new Date() : null,
      },
    });
  } catch (err) {
    if (isRecordNotFound(err)) throw await wrongDivisionError(id);
    throw err;
  }

  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
  revalidatePath(`/projects/${workOrder.projectId}`);
  revalidatePath("/dashboard");
}

/** 담당자가 진행관련 정보 및 질문(텍스트/스크린샷/참고 파일 경로)을 남긴다. */
export async function addWorkOrderLog(workOrderId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("로그인이 필요합니다.");
  requireActiveEditSession();

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

  let workOrder;
  try {
    workOrder = await prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      select: { progress: true },
    });
  } catch (err) {
    if (isRecordNotFound(err)) throw await wrongDivisionError(workOrderId);
    throw err;
  }

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
  requireActiveEditSession();

  const priority = formData.get("priority") as Priority;

  let workOrder;
  try {
    workOrder = await prisma.workOrder.update({
      where: { id },
      data: { priority },
    });
  } catch (err) {
    if (isRecordNotFound(err)) throw await wrongDivisionError(id);
    throw err;
  }

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
  requireActiveEditSession();

  const newAssigneeId = String(formData.get("assigneeId") ?? "");
  if (!newAssigneeId) throw new Error("이관할 담당자를 선택하세요.");

  const workOrder = await prisma.workOrder.findFirst({
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

  await prisma.$transaction([
    prisma.workOrder.update({
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
    prisma.workOrderLog.create({
      data: {
        workOrderId: id,
        authorId: session.user.id,
        note: `담당자를 ${fromLabel}에서 ${target.name}님으로 지정/이관했습니다.`,
      },
    }),
  ]);

  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
  revalidatePath("/dashboard");

  return { message: `${target.name}님에게 이관되었습니다.` };
}

export async function updateWorkOrderDetails(id: string, formData: FormData) {
  const user = await requireManager();
  requireActiveEditSession();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const dueDateRaw = formData.get("dueDate") as string | null;
  const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;
  const projectId = String(formData.get("projectId") ?? "");

  if (!title) throw new Error("제목을 입력하세요.");
  if (!projectId) throw new Error("프로젝트를 선택하세요.");

  let current;
  try {
    current = await prisma.workOrder.findUniqueOrThrow({
      where: { id },
      select: { projectId: true, parentId: true },
    });
  } catch (err) {
    if (isRecordNotFound(err)) throw await wrongDivisionError(id);
    throw err;
  }
  const projectChanged = projectId !== current.projectId;

  if (projectChanged) {
    const store = getNasStore();
    const migrationsDir = getMigrationsDir();
    const divisions = await orgDb.division.findMany({ select: { name: true } });
    const divisionKeys = allStoreKeys(divisions.map((d) => d.name));
    const activeKey = getActiveContextInfo()!.key;

    const result = await updateDescendantsProjectId(
      store,
      divisionKeys,
      migrationsDir,
      id,
      projectId,
      [activeKey],
      { name: user.name ?? user.email ?? "", email: user.email ?? "" },
    );
    if (!result.ok) {
      throw new Error(
        `"${result.blockedKey}"의 하위 업무를 ${result.lock.holderName}님이 편집 중이라 프로젝트를 변경할 수 없습니다.`,
      );
    }
  }

  const workOrder = await prisma.workOrder.update({
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

  const store = getNasStore();
  const migrationsDir = getMigrationsDir();
  const divisions = await orgDb.division.findMany({ select: { name: true } });
  const divisionKeys = allStoreKeys(divisions.map((d) => d.name));

  const located = await findWorkOrderById(store, divisionKeys, migrationsDir, id);
  if (!located) throw new Error("삭제할 업무를 찾을 수 없습니다.");
  const { projectId, parentId } = located.workOrder;

  const result = await deleteWorkOrderCascade(store, divisionKeys, migrationsDir, id, {
    name: user.name ?? user.email ?? "",
    email: user.email ?? "",
  });
  if (!result.ok) {
    throw new Error(
      `"${result.blockedKey}" 관련 업무를 ${result.lock.holderName}님이 편집 중이라 삭제할 수 없습니다. 잠시 후 다시 시도하세요.`,
    );
  }

  revalidatePath("/work-orders");
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${projectId}`);
  if (parentId) revalidatePath(`/work-orders/${parentId}`);
  redirect(`/projects/${projectId}`);
}

export async function createProject(formData: FormData) {
  const user = await requireManager();
  void user;

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const categoryId = (formData.get("categoryId") as string) || null;

  if (!name) throw new Error("프로젝트명을 입력하세요.");

  // Project는 division 파일이 아니라 조직 원본(org.db)에 저장한다. 여기서
  // prisma(현재 체크아웃된 과 파일)에 쓰면 그 과 파일에만 갇혀서 다른 모든
  // 조회(orgDb.project.findMany 등)에서 안 보이게 된다.
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
