/**
 * WorkOrder의 parentId는 더 이상 DB 레벨 FK가 아니다(과별 파일 분리로 인해
 * 부모/자식이 서로 다른 과 파일에 있을 수 있기 때문). 이 모듈이 여러 과 파일을
 * 훑어서 부모/자식/프로젝트 전체 업무를 애플리케이션 레벨로 찾아준다.
 *
 * 부서 전체(특정 과에 속하지 않는) 업무는 DEPT_COMMON_KEY 파일에 저장된다 -
 * org.db(조직도 원본)와는 별개의 파일로, 잠금 경합이 조직 관리와 섞이지 않게 한다.
 */

import { PrismaClient, type WorkOrder } from "@prisma/client";
import { NasStore } from "./nas-store";
import { queryAllDivisions } from "./multi-division-query";
import { ensureSchema } from "./schema-init";

export const DEPT_COMMON_KEY = "__부서공통__";

/** 집계 대상 과 파일 키 목록(부서 전체 공용 파일 포함)을 만든다. */
export function allStoreKeys(divisionNames: string[]): string[] {
  return [DEPT_COMMON_KEY, ...divisionNames];
}

export type LocatedWorkOrder = {
  key: string;
  workOrder: WorkOrder;
};

export type LocatedWorkOrderWithAssignee = {
  key: string;
  workOrder: WorkOrder & {
    assignedDept: { name: string } | null;
    assignedDiv: { name: string } | null;
    assignedTeam: { name: string } | null;
    assignedUser: { name: string } | null;
  };
};

async function collectAcrossDivisions<T>(
  store: NasStore,
  divisionKeys: string[],
  migrationsDir: string,
  queryFn: (client: PrismaClient, key: string) => Promise<T[]>,
): Promise<Array<{ key: string; value: T }>> {
  const results = await queryAllDivisions(store, divisionKeys, migrationsDir, queryFn);
  return results.flatMap((r) => r.value.map((value) => ({ key: r.key, value })));
}

/** 특정 WorkOrder id가 어느 과 파일에 있는지 찾는다(id는 전역적으로 고유). */
export async function findWorkOrderById(
  store: NasStore,
  divisionKeys: string[],
  migrationsDir: string,
  id: string,
): Promise<LocatedWorkOrder | null> {
  const results = await collectAcrossDivisions(store, divisionKeys, migrationsDir, (client) =>
    client.workOrder.findMany({ where: { id } }),
  );
  const found = results[0];
  return found ? { key: found.key, workOrder: found.value } : null;
}

/** 이 프로젝트에 속한 모든 WorkOrder를 전체 과 파일에서 모아온다. */
export async function getProjectWorkOrders(
  store: NasStore,
  divisionKeys: string[],
  migrationsDir: string,
  projectId: string,
): Promise<LocatedWorkOrder[]> {
  const results = await collectAcrossDivisions(store, divisionKeys, migrationsDir, (client) =>
    client.workOrder.findMany({ where: { projectId } }),
  );
  return results.map((r) => ({ key: r.key, workOrder: r.value }));
}

/** 특정 부모의 직계 자식들을 전체 과 파일에서 모아온다(담당자 표시용 관계 포함). */
export async function getChildren(
  store: NasStore,
  divisionKeys: string[],
  migrationsDir: string,
  parentId: string,
): Promise<LocatedWorkOrderWithAssignee[]> {
  const results = await collectAcrossDivisions(store, divisionKeys, migrationsDir, (client) =>
    client.workOrder.findMany({
      where: { parentId },
      include: {
        assignedDept: { select: { name: true } },
        assignedDiv: { select: { name: true } },
        assignedTeam: { select: { name: true } },
        assignedUser: { select: { name: true } },
      },
    }),
  );
  return results.map((r) => ({ key: r.key, workOrder: r.value }));
}

/** 특정 루트의 모든 하위(자식의 자식까지) 업무를 전체 과 파일에서 재귀적으로 모아온다. */
export async function getDescendants(
  store: NasStore,
  divisionKeys: string[],
  migrationsDir: string,
  rootId: string,
): Promise<LocatedWorkOrder[]> {
  // 모든 과 파일의 전체 WorkOrder를 한 번만 모아서, 메모리에서 트리를 재귀 탐색한다
  // (요청마다 매번 재조회하면 과 파일 수만큼 왕복이 늘어나므로).
  const all = await collectAcrossDivisions(store, divisionKeys, migrationsDir, (client) =>
    client.workOrder.findMany(),
  );
  const byParent = new Map<string, typeof all>();
  for (const item of all) {
    const pid = item.value.parentId;
    if (!pid) continue;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid)!.push(item);
  }

  const descendants: LocatedWorkOrder[] = [];
  const stack = [rootId];
  while (stack.length > 0) {
    const currentId = stack.pop()!;
    const kids = byParent.get(currentId) ?? [];
    for (const kid of kids) {
      descendants.push({ key: kid.key, workOrder: kid.value });
      stack.push(kid.value.id);
    }
  }
  return descendants;
}

export type WorkOrderDetail = WorkOrder & {
  key: string;
  project: { id: string; name: string };
  assignedDept: { name: string } | null;
  assignedDiv: { name: string } | null;
  assignedTeam: { name: string } | null;
  assignedUser: { name: string } | null;
  createdBy: { name: string };
  logs: Array<{
    id: string;
    note: string | null;
    progress: number | null;
    imagePath: string | null;
    filePath: string | null;
    createdAt: Date;
    author: { name: string };
  }>;
};

/**
 * 상세 화면에 필요한 모든 정보(소속 과 파일과 무관하게 id로 찾아서)를 한 번에 가져온다.
 * 읽기 전용 조회다 - 실제 편집(상태변경/로그추가 등)은 그 업무가 있는 과를
 * 별도로 편집 잠금 걸어서 진행해야 한다.
 */
export async function getWorkOrderDetail(
  store: NasStore,
  divisionKeys: string[],
  migrationsDir: string,
  id: string,
): Promise<WorkOrderDetail | null> {
  const located = await findWorkOrderById(store, divisionKeys, migrationsDir, id);
  if (!located) return null;

  const paths = store.checkoutReadOnly([located.key]);
  const dbPath = paths[located.key];
  if (!dbPath) return null;

  await ensureSchema(dbPath, migrationsDir);
  const client = new PrismaClient({ datasourceUrl: `file:${dbPath}` });
  try {
    const full = await client.workOrder.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        assignedDept: { select: { name: true } },
        assignedDiv: { select: { name: true } },
        assignedTeam: { select: { name: true } },
        assignedUser: { select: { name: true } },
        createdBy: { select: { name: true } },
        logs: {
          include: { author: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!full) return null;
    return { ...full, key: located.key };
  } finally {
    await client.$disconnect();
  }
}
