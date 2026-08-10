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

export function canManageOrg(role: Role): boolean {
  return role === "ADMIN";
}
