export type AssigneeInfo = {
  assigneeType: "DEPARTMENT" | "DIVISION" | "TEAM" | "USER";
  assignedDept?: { name: string } | null;
  assignedDiv?: { name: string } | null;
  assignedTeam?: { name: string } | null;
  assignedUser?: { name: string } | null;
};

const ASSIGNEE_TYPE_LABEL: Record<AssigneeInfo["assigneeType"], string> = {
  DEPARTMENT: "부서",
  DIVISION: "과",
  TEAM: "팀",
  USER: "개인",
};

export function formatAssignee(wo: AssigneeInfo): string {
  const name =
    wo.assignedDept?.name ??
    wo.assignedDiv?.name ??
    wo.assignedTeam?.name ??
    wo.assignedUser?.name ??
    "미지정";
  return `[${ASSIGNEE_TYPE_LABEL[wo.assigneeType]}] ${name}`;
}
