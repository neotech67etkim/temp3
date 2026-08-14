import type { Prisma, Role } from "@prisma/client";

/**
 * MEMBER = 과원(사무직, 과 단위까지만 소속). 팀은 현장 작업팀이며 팀장(TEAM_LEAD)만
 * 개별 사용자로 소속시키고, 팀원 개개인은 시스템에 별도로 등록하지 않는다.
 */
export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "관리자",
  DEPT_HEAD: "부서장",
  DIV_HEAD: "과장",
  TEAM_LEAD: "팀장",
  MEMBER: "과원",
};

export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "MEMBER", label: "과원" },
  { value: "TEAM_LEAD", label: "팀장" },
  { value: "DIV_HEAD", label: "과장" },
  { value: "DEPT_HEAD", label: "부서장" },
  { value: "ADMIN", label: "관리자" },
];

export type ScopedUser = {
  id: string;
  role: Role;
  departmentId: string | null;
  divisionId: string | null;
  teamId: string | null;
};

/** 역할에 따라 사용자가 조회 가능한 WorkOrder 범위를 Prisma where 절로 변환 */
export function workOrderScopeWhere(
  user: ScopedUser,
): Prisma.WorkOrderWhereInput {
  switch (user.role) {
    case "ADMIN":
      return {};

    case "DEPT_HEAD":
      if (!user.departmentId) return { assignedUserId: user.id };
      return {
        OR: [
          { assignedDeptId: user.departmentId },
          { assignedDiv: { departmentId: user.departmentId } },
          { assignedTeam: { division: { departmentId: user.departmentId } } },
          { assignedUser: { departmentId: user.departmentId } },
        ],
      };

    case "DIV_HEAD":
      if (!user.divisionId) return { assignedUserId: user.id };
      return {
        OR: [
          { assignedDivId: user.divisionId },
          { assignedTeam: { divisionId: user.divisionId } },
          { assignedUser: { divisionId: user.divisionId } },
        ],
      };

    case "TEAM_LEAD":
      if (!user.teamId) return { assignedUserId: user.id };
      return {
        OR: [
          { assignedTeamId: user.teamId },
          { assignedUser: { teamId: user.teamId } },
        ],
      };

    case "MEMBER":
    default:
      return { assignedUserId: user.id };
  }
}

/** 조직/업무 관리(생성, 하위 할당) 권한이 있는 역할인지 여부 */
export function canManageWorkOrders(role: Role): boolean {
  return role !== "MEMBER";
}

/**
 * Work Order 생성 시 선택 가능한 "할당 단위"(assigneeType).
 * 관리자만 부서/과/팀 단위 할당이 가능하고, 나머지는 개인(과인원)에게만 할당한다.
 */
export function assignableTypesFor(role: Role): Array<"DEPARTMENT" | "DIVISION" | "TEAM" | "USER"> {
  if (role === "ADMIN") return ["DEPARTMENT", "DIVISION", "TEAM", "USER"];
  return ["USER"];
}

/**
 * Work Order를 개인에게 할당할 때 선택 가능한 대상 사용자 범위.
 * - 관리자: 제한 없음(null)
 * - 부서장: 자기 부서 소속 과장/과원
 * - 과장: 자기 과 소속 과원
 * - 그 외(팀장/과원): 할당 권한 없음(존재할 수 없는 조건)
 */
export function assignableUsersWhere(
  creator: ScopedUser,
): Prisma.UserWhereInput {
  switch (creator.role) {
    case "ADMIN":
      return {};

    case "DEPT_HEAD":
      if (!creator.departmentId) return { id: "__none__" };
      return {
        departmentId: creator.departmentId,
        role: { in: ["DIV_HEAD", "MEMBER"] },
      };

    case "DIV_HEAD":
      if (!creator.divisionId) return { id: "__none__" };
      return {
        divisionId: creator.divisionId,
        role: "MEMBER",
      };

    default:
      return { id: "__none__" };
  }
}

export function canManageOrg(role: Role): boolean {
  return role === "ADMIN";
}

export const DEPT_COMMON_LABEL = "부서 공통";

/**
 * 이 사용자가 "편집 모드"로 체크아웃할 수 있는 과(파일 키) 목록을 정한다.
 * deptCommonKey는 work-order-tree.ts의 DEPT_COMMON_KEY를 그대로 넘겨받는다
 * (org-access.ts는 저장소 구현을 몰라도 되게 하기 위해 상수를 여기 두지 않음).
 * - ADMIN: 전체 과 + 부서 공통
 * - DEPT_HEAD: 자기 부서 소속 과 전체 + 부서 공통
 * - DIV_HEAD/TEAM_LEAD/MEMBER: 자기 소속 과 하나만
 */
export function editableDivisionKeysFor(
  user: ScopedUser,
  allDivisions: Array<{ id: string; name: string; departmentId: string }>,
  deptCommonKey: string,
): { key: string; label: string }[] {
  if (user.role === "ADMIN") {
    return [
      { key: deptCommonKey, label: DEPT_COMMON_LABEL },
      ...allDivisions.map((d) => ({ key: d.name, label: d.name })),
    ];
  }
  if (user.role === "DEPT_HEAD") {
    if (!user.departmentId) return [];
    return [
      { key: deptCommonKey, label: DEPT_COMMON_LABEL },
      ...allDivisions
        .filter((d) => d.departmentId === user.departmentId)
        .map((d) => ({ key: d.name, label: d.name })),
    ];
  }
  const own = allDivisions.find((d) => d.id === user.divisionId);
  return own ? [{ key: own.name, label: own.name }] : [];
}

/**
 * "업무리스트"(내 할일 + 내 업무 통합)에 표시할 WorkOrder 범위.
 * 조직 단위(부서/과/팀)로 할당된 업무는 그 조직을 이끄는 개인(부서장/과장/팀장)에게
 * 할당된 것과 동일하게 취급한다 — 결국 과로 할당된 업무는 과장 개인 업무와 같다.
 */
export function myWorkListWhere(user: ScopedUser): Prisma.WorkOrderWhereInput {
  const clauses: Prisma.WorkOrderWhereInput[] = [{ assignedUserId: user.id }];

  if (user.role === "DEPT_HEAD" && user.departmentId) {
    clauses.push({ assignedDeptId: user.departmentId });
  }
  if (user.role === "DIV_HEAD" && user.divisionId) {
    clauses.push({ assignedDivId: user.divisionId });
  }
  if (user.role === "TEAM_LEAD" && user.teamId) {
    clauses.push({ assignedTeamId: user.teamId });
  }

  return clauses.length > 1 ? { OR: clauses } : clauses[0];
}
