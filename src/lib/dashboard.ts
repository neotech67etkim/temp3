import { orgDb } from "@/lib/db";
import { computeProgress } from "@/lib/progress";
import type { NasStore } from "@/lib/nas-store";
import { queryAllDivisions } from "@/lib/multi-division-query";

export type OrgProgressNode = {
  id: string;
  name: string;
  progress: number;
  workOrderCount: number;
  children: OrgProgressNode[];
};

/**
 * 부서 > 과 > 팀 단위로 할당된 WorkOrder들의 진행률을 집계한다.
 * 특정 단계(부서/과/팀/개인)에 할당된 업무는 그 상위 조직 단계까지 누적 반영된다.
 */
export async function getOrgProgressTree(
  store: NasStore,
  divisionKeys: string[],
  migrationsDir: string,
): Promise<OrgProgressNode[]> {
  const [departments, results] = await Promise.all([
    orgDb.department.findMany({
      include: { divisions: { include: { teams: true } } },
      orderBy: { name: "asc" },
    }),
    queryAllDivisions(store, divisionKeys, migrationsDir, (client) =>
      client.workOrder.findMany({
        select: {
          id: true,
          parentId: true,
          progress: true,
          assignedDeptId: true,
          assignedDivId: true,
          assignedTeamId: true,
          assignedUserId: true,
          assignedUser: {
            select: { departmentId: true, divisionId: true, teamId: true },
          },
          assignedTeam: {
            select: {
              divisionId: true,
              division: { select: { departmentId: true } },
            },
          },
          assignedDiv: { select: { departmentId: true } },
        },
      }),
    ),
  ]);
  const workOrders = results.flatMap((r) => r.value);

  const progressMap = computeProgress(workOrders);

  const deptValues = new Map<string, number[]>();
  const divValues = new Map<string, number[]>();
  const teamValues = new Map<string, number[]>();

  const push = (map: Map<string, number[]>, key: string, value: number) => {
    const list = map.get(key) ?? [];
    list.push(value);
    map.set(key, list);
  };

  for (const wo of workOrders) {
    const value = progressMap.get(wo.id) ?? 0;

    let departmentId: string | null = null;
    let divisionId: string | null = null;
    let teamId: string | null = null;

    if (wo.assignedDeptId) {
      departmentId = wo.assignedDeptId;
    } else if (wo.assignedDivId) {
      departmentId = wo.assignedDiv?.departmentId ?? null;
      divisionId = wo.assignedDivId;
    } else if (wo.assignedTeamId) {
      departmentId = wo.assignedTeam?.division.departmentId ?? null;
      divisionId = wo.assignedTeam?.divisionId ?? null;
      teamId = wo.assignedTeamId;
    } else if (wo.assignedUserId) {
      departmentId = wo.assignedUser?.departmentId ?? null;
      divisionId = wo.assignedUser?.divisionId ?? null;
      teamId = wo.assignedUser?.teamId ?? null;
    }

    if (departmentId) push(deptValues, departmentId, value);
    if (divisionId) push(divValues, divisionId, value);
    if (teamId) push(teamValues, teamId, value);
  }

  const avg = (values: number[] | undefined) =>
    values && values.length
      ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
      : 0;

  return departments.map((dept) => ({
    id: dept.id,
    name: dept.name,
    progress: avg(deptValues.get(dept.id)),
    workOrderCount: (deptValues.get(dept.id) ?? []).length,
    children: dept.divisions.map((div) => ({
      id: div.id,
      name: div.name,
      progress: avg(divValues.get(div.id)),
      workOrderCount: (divValues.get(div.id) ?? []).length,
      children: div.teams.map((team) => ({
        id: team.id,
        name: team.name,
        progress: avg(teamValues.get(team.id)),
        workOrderCount: (teamValues.get(team.id) ?? []).length,
        children: [] as OrgProgressNode[],
      })),
    })),
  }));
}
