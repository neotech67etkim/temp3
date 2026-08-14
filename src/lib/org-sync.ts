/**
 * org.db(조직도/계정/업무영역/프로젝트의 원본)를 각 과 파일로 동기화하는 모듈.
 *
 * - 각 과 파일(예: 철목정도과.db)은 자신이 소유한 WorkOrder/WorkOrderLog 외에,
 *   Department/Division/Team/User/Category/Project를 "읽기 전용 미러"로도 갖고 있어야
 *   로컬에서 Prisma의 관계형 조회(FK join)가 정상 동작한다.
 * - 동기화는 항상 org.db -> 과 파일 방향(단방향)이고, WorkOrder/WorkOrderLog 테이블은
 *   절대 건드리지 않는다(그건 각 과 파일이 직접 소유하는 데이터).
 * - 이번 버전은 upsert만 수행한다(삭제된 조직 데이터를 지우는 것은 하지 않음) —
 *   조직 변경(인사이동 등)은 자주 있는 일이 아니고, 삭제 전파는 그 과 파일에 남아있는
 *   WorkOrder가 그 사람/조직을 참조 중일 때 외래키 제약과 충돌할 수 있어 더 신중한 설계가
 *   필요하기 때문. 필요해지면 이후 버전에서 다룬다.
 */

import { PrismaClient } from "@prisma/client";
import { ensureSchema } from "./schema-init";

export type OrgSyncResult = {
  departments: number;
  divisions: number;
  teams: number;
  categories: number;
  projects: number;
  users: number;
};

export async function syncOrgInto(
  orgDbPath: string,
  targetDbPath: string,
  migrationsDir: string,
): Promise<OrgSyncResult> {
  await ensureSchema(orgDbPath, migrationsDir);
  await ensureSchema(targetDbPath, migrationsDir);

  const org = new PrismaClient({ datasourceUrl: `file:${orgDbPath}` });
  const target = new PrismaClient({ datasourceUrl: `file:${targetDbPath}` });

  try {
    const [departments, divisions, teams, categories, projects, users] =
      await Promise.all([
        org.department.findMany(),
        org.division.findMany(),
        org.team.findMany(),
        org.category.findMany(),
        org.project.findMany(),
        org.user.findMany(),
      ]);

    // FK 의존 순서: Department -> Division -> Team, Category -> Project, 마지막 User
    for (const d of departments) {
      await target.department.upsert({ where: { id: d.id }, create: d, update: d });
    }
    for (const c of categories) {
      await target.category.upsert({ where: { id: c.id }, create: c, update: c });
    }
    for (const div of divisions) {
      await target.division.upsert({ where: { id: div.id }, create: div, update: div });
    }
    for (const p of projects) {
      await target.project.upsert({ where: { id: p.id }, create: p, update: p });
    }
    for (const t of teams) {
      await target.team.upsert({ where: { id: t.id }, create: t, update: t });
    }
    for (const u of users) {
      await target.user.upsert({ where: { id: u.id }, create: u, update: u });
    }

    return {
      departments: departments.length,
      divisions: divisions.length,
      teams: teams.length,
      categories: categories.length,
      projects: projects.length,
      users: users.length,
    };
  } finally {
    await org.$disconnect();
    await target.$disconnect();
  }
}
