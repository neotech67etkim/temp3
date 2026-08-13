import {
  PrismaClient,
  Role,
  AssigneeType,
  WorkOrderStatus,
  Priority,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

type ItemSeed = {
  divisionKey: DivisionKey;
  projectKey: ProjectKey;
  title: string;
  priority?: Priority;
  dueDate?: string;
  status?: WorkOrderStatus;
  children?: string[];
};

type DivisionKey =
  | "철목정도과"
  | "설비과"
  | "외업도장과"
  | "선행도장과"
  | "통합공정과"
  | "안전운영과";

type ProjectKey = "TRION" | "RUYA" | "DH" | "OPS";

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  await prisma.user.upsert({
    where: { email: "admin@company.com" },
    update: {},
    create: {
      email: "admin@company.com",
      name: "관리자",
      role: Role.ADMIN,
      passwordHash,
    },
  });

  // --- 조직: 해양시스템공사부 (실제 조직) ---
  const dept = await prisma.department.upsert({
    where: { name: "해양시스템공사부" },
    update: {},
    create: { name: "해양시스템공사부" },
  });

  const divisionNames: DivisionKey[] = [
    "철목정도과",
    "설비과",
    "외업도장과",
    "선행도장과",
    "통합공정과",
    "안전운영과",
  ];

  const divisions = {} as Record<DivisionKey, { id: string }>;
  for (const name of divisionNames) {
    divisions[name] = await prisma.division.upsert({
      where: { departmentId_name: { departmentId: dept.id, name } },
      update: {},
      create: { name, departmentId: dept.id },
    });
  }

  // --- 부서원 (2026-08 조직도 기준) ---
  // divisionKey가 없으면 부서 직속(부서장 등), 있으면 해당 과 소속(과원 또는 과장)
  type StaffSeed = {
    name: string;
    email: string;
    role: Role;
    divisionKey?: DivisionKey;
  };

  const staff: StaffSeed[] = [
    { name: "이재석", email: "leejs@hd.com", role: Role.DEPT_HEAD },
    { name: "Q5L0관리자", email: "g5l0a@bp.hd.com", role: Role.MEMBER },

    // 선행도장과
    {
      name: "천홍민",
      email: "hongmincheon@hd.com",
      role: Role.DIV_HEAD,
      divisionKey: "선행도장과",
    },
    {
      name: "주종일",
      email: "jongil@hd.com",
      role: Role.MEMBER,
      divisionKey: "선행도장과",
    },
    {
      name: "정순욱",
      email: "jsw704@hd.com",
      role: Role.MEMBER,
      divisionKey: "선행도장과",
    },
    {
      name: "성기협",
      email: "sung0608@hd.com",
      role: Role.MEMBER,
      divisionKey: "선행도장과",
    },

    // 안전운영과
    {
      name: "신경훈",
      email: "ghshin@hd.com",
      role: Role.DIV_HEAD,
      divisionKey: "안전운영과",
    },
    {
      name: "우남용",
      email: "true21c@hd.com",
      role: Role.MEMBER,
      divisionKey: "안전운영과",
    },

    // 설비과
    {
      name: "신성필",
      email: "spshin@hd.com",
      role: Role.MEMBER,
      divisionKey: "설비과",
    },
    {
      name: "한성일",
      email: "sihan@hd.com",
      role: Role.MEMBER,
      divisionKey: "설비과",
    },
    {
      name: "김대성",
      email: "dae0179@hd.com",
      role: Role.DIV_HEAD,
      divisionKey: "설비과",
    },
    {
      name: "김재민",
      email: "kjmks33@hd.com",
      role: Role.MEMBER,
      divisionKey: "설비과",
    },

    // 철목정도과
    {
      name: "허필훈",
      email: "hph@hd.com",
      role: Role.DIV_HEAD,
      divisionKey: "철목정도과",
    },
    {
      name: "이준석",
      email: "junslee@hd.com",
      role: Role.MEMBER,
      divisionKey: "철목정도과",
    },
    {
      name: "김성록",
      email: "ttyf99@hd.com",
      role: Role.MEMBER,
      divisionKey: "철목정도과",
    },

    // 외업도장과
    {
      name: "김의택",
      email: "tech67@hd.com",
      role: Role.DIV_HEAD,
      divisionKey: "외업도장과",
    },
    {
      name: "정성운",
      email: "jsu3963@hd.com",
      role: Role.MEMBER,
      divisionKey: "외업도장과",
    },
    {
      name: "김재확",
      email: "jaehwak@hd.com",
      role: Role.MEMBER,
      divisionKey: "외업도장과",
    },
    {
      name: "유종탁",
      email: "yoot@hd.com",
      role: Role.MEMBER,
      divisionKey: "외업도장과",
    },

    // 통합공정과
    {
      name: "황득근",
      email: "dghwang@hd.com",
      role: Role.DIV_HEAD,
      divisionKey: "통합공정과",
    },
    {
      name: "김규남",
      email: "gn.kim@hd.com",
      role: Role.MEMBER,
      divisionKey: "통합공정과",
    },
    {
      name: "김승용",
      email: "honestk@hd.com",
      role: Role.MEMBER,
      divisionKey: "통합공정과",
    },
    {
      name: "송미정",
      email: "mijungsong@hd.com",
      role: Role.MEMBER,
      divisionKey: "통합공정과",
    },
    {
      name: "윤지",
      email: "yunj@hd.com",
      role: Role.MEMBER,
      divisionKey: "통합공정과",
    },
  ];

  for (const person of staff) {
    const divisionId = person.divisionKey
      ? divisions[person.divisionKey].id
      : null;
    await prisma.user.upsert({
      where: { email: person.email },
      update: {
        name: person.name,
        role: person.role,
        departmentId: dept.id,
        divisionId,
      },
      create: {
        name: person.name,
        email: person.email,
        passwordHash,
        role: person.role,
        departmentId: dept.id,
        divisionId,
      },
    });
  }

  // Work Order 지시자는 실제 지시권자인 부서장 계정으로 기록한다(관리자 계정은 시스템 관리용).
  const deptHead = await prisma.user.findUniqueOrThrow({
    where: { email: "leejs@hd.com" },
  });

  // --- 카테고리 / 프로젝트(공사) ---
  const constructionCategory = await prisma.category.upsert({
    where: { name: "건조 프로젝트" },
    update: {},
    create: { name: "건조 프로젝트", color: "#2563eb" },
  });
  const opsCategory = await prisma.category.upsert({
    where: { name: "상시운영" },
    update: {},
    create: { name: "상시운영", color: "#64748b" },
  });

  const projectDefs: Record<
    ProjectKey,
    { name: string; categoryId: string }
  > = {
    TRION: { name: "TRION", categoryId: constructionCategory.id },
    RUYA: { name: "RUYA", categoryId: constructionCategory.id },
    DH: { name: "D/H (Deck House)", categoryId: constructionCategory.id },
    OPS: { name: "일반운영", categoryId: opsCategory.id },
  };

  const projects = {} as Record<ProjectKey, { id: string }>;
  for (const key of Object.keys(projectDefs) as ProjectKey[]) {
    const def = projectDefs[key];
    const existing = await prisma.project.findFirst({
      where: { name: def.name },
    });
    projects[key] =
      existing ??
      (await prisma.project.create({
        data: { name: def.name, categoryId: def.categoryId },
      }));
  }

  // --- Work Order (2026-07-22 업무 현황 기준) ---
  const items: ItemSeed[] = [
    {
      divisionKey: "철목정도과",
      projectKey: "TRION",
      title: "잔여 물량 상세 처리 계획",
      priority: Priority.URGENT,
      children: [
        "TRION Hull 잔여 물량 정리 (직영/상주 구분, 예산 없는 Act. 추가 품의)",
        "Trion Hull Topflange 설치",
        "Trion Hull Caisson 설치",
        "OVT, Sea Fastening Bracket 용접 -> 구조 해석 이후 현재 OVT 설치 상태로 용접",
        "Hull Tank MC(상주), C01A 일정",
        "부하, 능률 포함 재보고",
      ],
    },
    {
      divisionKey: "철목정도과",
      projectKey: "RUYA",
      title: "RUYA LEVEL4 Level Up 이후 SUP'T 방법 변경",
      priority: Priority.URGENT,
    },
    {
      divisionKey: "철목정도과",
      projectKey: "RUYA",
      title: "RUYA ELEC. Building 탑재 준비: 매주 목요일 실시",
      dueDate: "2026-07-25",
    },
    {
      divisionKey: "설비과",
      projectKey: "RUYA",
      title: "Contraflame 공정 만회 대책",
      priority: Priority.URGENT,
      children: [
        "계획 vs 실적을 알 수 있는 KPI(현재 지연인지? 아닌지?)",
        "구역 별 상세 계획/인원 계획",
        "탑재 후 작업 순서대로 착수 하도록 준비할 것",
        "미착수 구역은 발판/도장까지 끝내서 탑재, 모노레일 테스트 구역은 먼저 실시",
        "추가 협력사 동원 계약 마무리(추가 품의 포함)",
      ],
    },
    {
      divisionKey: "설비과",
      projectKey: "DH",
      title: "중형선 D/H 준비",
      dueDate: "2026-10-31",
      children: [
        "착수 시점 기준 역으로 주요 조치 사항 계획 작성",
        "Work Scope 정리, Pocal Point 선정, 업체 선정, 운반 정반, 작업장 세팅, 자재, 검사, 설계 등",
      ],
    },
    {
      divisionKey: "설비과",
      projectKey: "TRION",
      title: "TRION 잔여 작업 정리",
      children: [
        "LQ 잔여 작업 계획",
        "Hull 잔여 작업 계획",
        "Topside, Room final 작업 계획, 보온 작업 계획",
      ],
    },
    {
      divisionKey: "외업도장과",
      projectKey: "TRION",
      title: "TRION HULL 일정 준수, 후속 수정작업 방안(부문장 보고)",
    },
    {
      divisionKey: "외업도장과",
      projectKey: "TRION",
      title:
        "TRION HULL 전체 잔여 작업 보고(부문장 보고): 외업5, 철목구조, 도장, 시운전",
    },
    {
      divisionKey: "외업도장과",
      projectKey: "TRION",
      title: "Production Deck 상하부 작업 방법",
      children: [
        "Deck 상부 장비 코팅 도장(진행 중)",
        "Deck 하부 Sky 작업",
        "Center UCF, SIDE UCF",
      ],
    },
    {
      divisionKey: "외업도장과",
      projectKey: "TRION",
      title: "TRION Hull 완료 계획(통합공정과 최종 취합)",
      priority: Priority.URGENT,
    },
    {
      divisionKey: "외업도장과",
      projectKey: "TRION",
      title:
        "TRION Tank 진수, Strength Test, Inclined Test 시 Tank 자재/배수 방법",
      priority: Priority.URGENT,
    },
    {
      divisionKey: "외업도장과",
      projectKey: "RUYA",
      title: "Ruya Rope Man 5월 중 계획",
      status: WorkOrderStatus.IN_PROGRESS,
    },
    {
      divisionKey: "외업도장과",
      projectKey: "OPS",
      title: "AI 업무 개선 -> 업무 처리방안 협의 필요",
    },
    {
      divisionKey: "선행도장과",
      projectKey: "OPS",
      title: "처리 가능 Capa. 증대 방안",
      priority: Priority.URGENT,
      children: [
        "사업기획부와 맞출 것",
        "관련부서와 회의 진행할 것(물양장 허브 땅 문제, 블록 회전문제, 주말 검사 문제 등)",
        "블라스팅/도장 공장의 부분 분석 자료로 만들기",
      ],
    },
    {
      divisionKey: "선행도장과",
      projectKey: "DH",
      title: "중형선 D/H 작업 방법 검토",
      dueDate: "2026-07-31",
    },
    {
      divisionKey: "통합공정과",
      projectKey: "RUYA",
      title: "Ruya MC Setting(6월초) -> RFC F/U 방법 검토",
    },
    {
      divisionKey: "통합공정과",
      projectKey: "OPS",
      title: "신규 인원 포함 Work Scope 정리해서 보고",
    },
    {
      divisionKey: "통합공정과",
      projectKey: "TRION",
      title:
        "TRION HULL 전체 잔여 작업 보고(부문장 보고, 차주 TRION 공정 회의 시 보고): 외업5, 철목구조, 도장, 시운전",
    },
    {
      divisionKey: "안전운영과",
      projectKey: "OPS",
      title: "확보예산/예산투입/부족예산, 능률 취합",
      dueDate: "2026-12-31",
      children: [
        "기성 자료, 매주 월",
        "주간(1개월), 매월 말",
        "월간(1개월) + 협력사 기성 집행 현황",
      ],
    },
    {
      divisionKey: "안전운영과",
      projectKey: "OPS",
      title: "ESG 활동 방안 취합",
    },
    {
      divisionKey: "안전운영과",
      projectKey: "OPS",
      title: "신입사원 OJT",
    },
    {
      divisionKey: "안전운영과",
      projectKey: "OPS",
      title: "하모니 데이 사전 준비 -> 잠정 중단",
      priority: Priority.LOW,
    },
    {
      divisionKey: "안전운영과",
      projectKey: "OPS",
      title: "위험성 평가 점검 계획",
    },
  ];

  for (const item of items) {
    const divisionId = divisions[item.divisionKey].id;
    const projectId = projects[item.projectKey].id;

    const parent = await prisma.workOrder.create({
      data: {
        title: `${item.divisionKey}-${item.title}`,
        projectId,
        assigneeType: AssigneeType.DIVISION,
        assignedDivId: divisionId,
        priority: item.priority ?? Priority.NORMAL,
        status: item.status ?? WorkOrderStatus.NOT_STARTED,
        dueDate: item.dueDate ? new Date(item.dueDate) : null,
        createdById: deptHead.id,
      },
    });

    for (const childTitle of item.children ?? []) {
      const inProgress = childTitle.includes("진행 중");
      await prisma.workOrder.create({
        data: {
          title: childTitle,
          projectId,
          parentId: parent.id,
          assigneeType: AssigneeType.DIVISION,
          assignedDivId: divisionId,
          status: inProgress
            ? WorkOrderStatus.IN_PROGRESS
            : WorkOrderStatus.NOT_STARTED,
          createdById: deptHead.id,
        },
      });
    }
  }

  console.log("Seed 완료. 로그인 계정 (비밀번호: password123, 최초 로그인 후 /account 에서 변경 권장):");
  console.log("  admin@company.com (ADMIN)");
  console.log(`  부서원 ${staff.length}명 (이메일을 로그인 아이디로 사용)`);
  console.log(
    `조직: ${dept.name} / 과 ${divisionNames.length}개, 프로젝트 ${
      Object.keys(projectDefs).length
    }개, Work Order ${items.length}개(상위) 생성 완료`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
