"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AssigneeType, Priority, WorkOrderStatus } from "@prisma/client";
import {
  prisma,
  orgDb,
  getActiveContextInfo,
  getHeldClient,
  switchCurrentDivision,
} from "@/lib/db";
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

/**
 * 지금 편집 세션이 열려 있는지, 그리고 그 세션을 시작한 사람이 지금 요청을
 * 보낸 사람과 같은지 확인한다(없으면 /select-division으로 유도). 활성
 * 상태는 프로세스 전역이라서, 이 확인이 없으면 다른 사람이 시작한 편집
 * 세션에 대고 마치 자기 편집인 것처럼 내용을 바꿔버릴 수 있다.
 */
function requireActiveEditSession(userEmail: string): void {
  const info = getActiveContextInfo();
  if (!info || info.mode !== "edit") {
    throw new Error(
      "지금 편집 중인 과가 없습니다. 화면 상단의 '편집 시작'에서 편집할 과를 먼저 선택하세요.",
    );
  }
  if (info.holder.email !== userEmail) {
    throw new Error(
      `이 편집 세션은 ${info.holder.name}님이 시작했습니다. 본인이 시작한 편집만 내용을 바꿀 수 있습니다.`,
    );
  }
}

/**
 * 지금 편집 세션이 들고 있는 과들 중 이 id가 실제로 있는 과를 찾아서
 * prisma가 가리키는 대상을 그 과로 전환한다(부서장의 "전체 편집 시작"처럼
 * 여러 과를 동시에 들고 있을 수 있으므로, 어느 업무를 만지든 자동으로 맞는
 * 과 파일을 골라준다). 어느 held 과에도 없으면 null.
 */
async function switchToHeldDivisionOf(id: string): Promise<string | null> {
  const info = getActiveContextInfo();
  if (!info) return null;
  const ordered = info.currentKey
    ? [info.currentKey, ...info.keys.filter((k) => k !== info.currentKey)]
    : info.keys;
  for (const key of ordered) {
    const client = getHeldClient(key);
    if (!client) continue;
    const found = await client.workOrder.findUnique({
      where: { id },
      select: { id: true },
    });
    if (found) {
      switchCurrentDivision(key);
      return key;
    }
  }
  return null;
}

/**
 * 개별 작업 하나가 끝날 때마다 그 과를 즉시 원본(NAS)에 반영한다(잠금은
 * 계속 유지). "저장하고 종료"를 몰아서 누르기 전에 문제가 생겨도, 마지막
 * 개별 작업까지는 원본에 남아있도록 하기 위함 - 몰아서 저장하면 그 사이
 * 작업 내용이 통째로 날아갈 수 있어서 매번 즉시 반영한다.
 */
function syncDivision(key: string): void {
  getNasStore().syncToRemote(key);
}

/** id가 지금 편집 세션에 없는 과에 있을 때 보여줄 안내 메시지를 만든다. */
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

  requireActiveEditSession(user.email ?? "");
  const expectedKey = await resolveTargetDivisionKey(assigneeType, assigneeId);
  if (expectedKey && !switchCurrentDivision(expectedKey)) {
    throw new Error(
      `이 할당 대상은 "${expectedKey}"에 속합니다. 지금 편집 세션에 그 과가 포함되어 있지 않습니다. 화면 상단 '편집 시작'에서 그 과를 먼저 여세요.`,
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
  if (expectedKey) syncDivision(expectedKey);

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

  requireActiveEditSession(session.user.email ?? "");
  const expectedKey = session.user.divisionId
    ? (await orgDb.division.findUnique({ where: { id: session.user.divisionId } }))?.name
    : DEPT_COMMON_KEY;
  if (expectedKey && !switchCurrentDivision(expectedKey)) {
    throw new Error(
      `내 할일은 "${expectedKey}"에 저장됩니다. 화면 상단 '편집 시작'에서 그 과를 먼저 여세요.`,
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
  if (expectedKey) syncDivision(expectedKey);

  revalidatePath("/dashboard");
}

export async function updateWorkOrderStatus(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("로그인이 필요합니다.");
  requireActiveEditSession(session.user.email ?? "");

  const targetKey = await switchToHeldDivisionOf(id);
  if (!targetKey) throw await wrongDivisionError(id);

  const status = formData.get("status") as WorkOrderStatus;

  const workOrder = await prisma.workOrder.update({
    where: { id },
    data: {
      status,
      completedAt: status === WorkOrderStatus.COMPLETED ? new Date() : null,
    },
  });
  syncDivision(targetKey);

  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
  revalidatePath(`/projects/${workOrder.projectId}`);
  revalidatePath("/dashboard");
}

export async function updateWorkOrderProgress(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("로그인이 필요합니다.");
  requireActiveEditSession(session.user.email ?? "");

  const targetKey = await switchToHeldDivisionOf(id);
  if (!targetKey) throw await wrongDivisionError(id);

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
  syncDivision(targetKey);

  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
  revalidatePath(`/projects/${workOrder.projectId}`);
  revalidatePath("/dashboard");
}

/** 담당자가 진행관련 정보 및 질문(텍스트/스크린샷/참고 파일 경로)을 남긴다. */
export async function addWorkOrderLog(workOrderId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("로그인이 필요합니다.");
  requireActiveEditSession(session.user.email ?? "");

  const targetKey = await switchToHeldDivisionOf(workOrderId);
  if (!targetKey) throw await wrongDivisionError(workOrderId);

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
  syncDivision(targetKey);

  revalidatePath(`/work-orders/${workOrderId}`);
}

export async function updateWorkOrderPriority(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("로그인이 필요합니다.");
  requireActiveEditSession(session.user.email ?? "");

  const targetKey = await switchToHeldDivisionOf(id);
  if (!targetKey) throw await wrongDivisionError(id);

  const priority = formData.get("priority") as Priority;

  const workOrder = await prisma.workOrder.update({
    where: { id },
    data: { priority },
  });
  syncDivision(targetKey);

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
  requireActiveEditSession(session.user.email ?? "");

  const targetKey = await switchToHeldDivisionOf(id);
  if (!targetKey) throw await wrongDivisionError(id);

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
  syncDivision(targetKey);

  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
  revalidatePath("/dashboard");

  return { message: `${target.name}님에게 이관되었습니다.` };
}

export async function updateWorkOrderDetails(id: string, formData: FormData) {
  const user = await requireManager();
  requireActiveEditSession(user.email ?? "");

  const targetKey = await switchToHeldDivisionOf(id);
  if (!targetKey) throw await wrongDivisionError(id);

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const dueDateRaw = formData.get("dueDate") as string | null;
  const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;
  const projectId = String(formData.get("projectId") ?? "");

  if (!title) throw new Error("제목을 입력하세요.");
  if (!projectId) throw new Error("프로젝트를 선택하세요.");

  const current = await prisma.workOrder.findUniqueOrThrow({
    where: { id },
    select: { projectId: true, parentId: true },
  });
  const projectChanged = projectId !== current.projectId;

  if (projectChanged) {
    const store = getNasStore();
    const migrationsDir = getMigrationsDir();
    const divisions = await orgDb.division.findMany({ select: { name: true } });
    const divisionKeys = allStoreKeys(divisions.map((d) => d.name));
    const heldKeys = getActiveContextInfo()!.keys;

    const result = await updateDescendantsProjectId(
      store,
      divisionKeys,
      migrationsDir,
      id,
      projectId,
      heldKeys,
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
  syncDivision(targetKey);

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

  // 지금 편집 세션이 이미 들고 있는 과는 다시 잠그려 하지 않는다(이미 내가
  // 잠근 파일을 또 잠그려 하면 실패하기 때문) - deleteWorkOrderCascade가
  // 그 과들은 세션이 열어 둔 커넥션을 재사용하고 즉시 원본에 반영한다.
  const alreadyHeldKeys = getActiveContextInfo()?.keys ?? [];
  const result = await deleteWorkOrderCascade(
    store,
    divisionKeys,
    migrationsDir,
    id,
    { name: user.name ?? user.email ?? "", email: user.email ?? "" },
    alreadyHeldKeys,
  );
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
