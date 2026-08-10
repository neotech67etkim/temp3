import { PrismaClient, Role, AssigneeType, WorkOrderStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@company.com" },
    update: {},
    create: {
      email: "admin@company.com",
      name: "관리자",
      role: Role.ADMIN,
      passwordHash,
    },
  });

  const devDept = await prisma.department.upsert({
    where: { name: "개발본부" },
    update: {},
    create: { name: "개발본부" },
  });
  const salesDept = await prisma.department.upsert({
    where: { name: "영업본부" },
    update: {},
    create: { name: "영업본부" },
  });

  const platformDiv = await prisma.division.upsert({
    where: { departmentId_name: { departmentId: devDept.id, name: "플랫폼개발과" } },
    update: {},
    create: { name: "플랫폼개발과", departmentId: devDept.id },
  });
  const qaDiv = await prisma.division.upsert({
    where: { departmentId_name: { departmentId: devDept.id, name: "품질관리과" } },
    update: {},
    create: { name: "품질관리과", departmentId: devDept.id },
  });
  await prisma.division.upsert({
    where: { departmentId_name: { departmentId: salesDept.id, name: "국내영업과" } },
    update: {},
    create: { name: "국내영업과", departmentId: salesDept.id },
  });

  const backendTeam = await prisma.team.upsert({
    where: { divisionId_name: { divisionId: platformDiv.id, name: "백엔드팀" } },
    update: {},
    create: { name: "백엔드팀", divisionId: platformDiv.id },
  });
  await prisma.team.upsert({
    where: { divisionId_name: { divisionId: platformDiv.id, name: "프론트엔드팀" } },
    update: {},
    create: { name: "프론트엔드팀", divisionId: platformDiv.id },
  });
  await prisma.team.upsert({
    where: { divisionId_name: { divisionId: qaDiv.id, name: "테스트팀" } },
    update: {},
    create: { name: "테스트팀", divisionId: qaDiv.id },
  });

  const deptHead = await prisma.user.upsert({
    where: { email: "dept.head@company.com" },
    update: {},
    create: {
      email: "dept.head@company.com",
      name: "김부서장",
      role: Role.DEPT_HEAD,
      passwordHash,
      departmentId: devDept.id,
    },
  });
  const divHead = await prisma.user.upsert({
    where: { email: "div.head@company.com" },
    update: {},
    create: {
      email: "div.head@company.com",
      name: "이과장",
      role: Role.DIV_HEAD,
      passwordHash,
      departmentId: devDept.id,
      divisionId: platformDiv.id,
    },
  });
  const teamLead = await prisma.user.upsert({
    where: { email: "team.lead@company.com" },
    update: {},
    create: {
      email: "team.lead@company.com",
      name: "박팀장",
      role: Role.TEAM_LEAD,
      passwordHash,
      departmentId: devDept.id,
      divisionId: platformDiv.id,
      teamId: backendTeam.id,
    },
  });
  const member = await prisma.user.upsert({
    where: { email: "member@company.com" },
    update: {},
    create: {
      email: "member@company.com",
      name: "최사원",
      role: Role.MEMBER,
      passwordHash,
      departmentId: devDept.id,
      divisionId: platformDiv.id,
      teamId: backendTeam.id,
    },
  });

  const q3Category = await prisma.category.upsert({
    where: { name: "2026 3분기 핵심과제" },
    update: {},
    create: { name: "2026 3분기 핵심과제", color: "#2563eb" },
  });

  const platformProject = await prisma.project.upsert({
    where: { id: "seed-platform-project" },
    update: {},
    create: {
      id: "seed-platform-project",
      name: "차세대 플랫폼 구축",
      description: "사내 업무 플랫폼 전면 개편 프로젝트",
      categoryId: q3Category.id,
    },
  });

  const deptWorkOrder = await prisma.workOrder.upsert({
    where: { id: "seed-wo-dept" },
    update: {},
    create: {
      id: "seed-wo-dept",
      title: "플랫폼 개발본부 업무지시",
      description: "차세대 플랫폼 구축을 위한 개발본부 전체 업무",
      projectId: platformProject.id,
      assigneeType: AssigneeType.DEPARTMENT,
      assignedDeptId: devDept.id,
      status: WorkOrderStatus.IN_PROGRESS,
      progress: 0,
      createdById: admin.id,
    },
  });

  const divWorkOrder = await prisma.workOrder.upsert({
    where: { id: "seed-wo-div" },
    update: {},
    create: {
      id: "seed-wo-div",
      title: "플랫폼개발과 업무 분배",
      parentId: deptWorkOrder.id,
      projectId: platformProject.id,
      assigneeType: AssigneeType.DIVISION,
      assignedDivId: platformDiv.id,
      status: WorkOrderStatus.IN_PROGRESS,
      progress: 0,
      createdById: deptHead.id,
    },
  });

  const teamWorkOrder = await prisma.workOrder.upsert({
    where: { id: "seed-wo-team" },
    update: {},
    create: {
      id: "seed-wo-team",
      title: "백엔드팀 API 개발",
      parentId: divWorkOrder.id,
      projectId: platformProject.id,
      assigneeType: AssigneeType.TEAM,
      assignedTeamId: backendTeam.id,
      status: WorkOrderStatus.IN_PROGRESS,
      progress: 0,
      createdById: divHead.id,
    },
  });

  await prisma.workOrder.upsert({
    where: { id: "seed-wo-user-1" },
    update: {},
    create: {
      id: "seed-wo-user-1",
      title: "업무 할당 API 개발",
      parentId: teamWorkOrder.id,
      projectId: platformProject.id,
      assigneeType: AssigneeType.USER,
      assignedUserId: member.id,
      status: WorkOrderStatus.IN_PROGRESS,
      progress: 40,
      createdById: teamLead.id,
    },
  });

  await prisma.workOrder.upsert({
    where: { id: "seed-wo-user-2" },
    update: {},
    create: {
      id: "seed-wo-user-2",
      title: "진행률 대시보드 화면 개발",
      parentId: teamWorkOrder.id,
      projectId: platformProject.id,
      assigneeType: AssigneeType.USER,
      assignedUserId: teamLead.id,
      status: WorkOrderStatus.NOT_STARTED,
      progress: 0,
      createdById: teamLead.id,
    },
  });

  console.log("Seed 완료. 로그인 계정 (비밀번호 공통: password123):");
  console.log("  admin@company.com (ADMIN)");
  console.log("  dept.head@company.com (DEPT_HEAD)");
  console.log("  div.head@company.com (DIV_HEAD)");
  console.log("  team.lead@company.com (TEAM_LEAD)");
  console.log("  member@company.com (MEMBER)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
