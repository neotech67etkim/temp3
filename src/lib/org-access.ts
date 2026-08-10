import type { Prisma, Role } from "@prisma/client";

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
