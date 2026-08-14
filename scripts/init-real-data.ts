/**
 * 최초 1회 실행용: 실제 해양시스템공사부 조직도(부서/과/24명) + 업무영역/프로젝트를
 * org.db에, 그리고 2026-07-22 기준 실제 업무 현황을 각 과 파일에 만들어 넣는다.
 *
 * 사용법 (NAS 경로를 첫 번째 인자로):
 *   npx tsx scripts/init-real-data.ts "V:\10. 외업도장과\AI 프로젝트\dev"
 *
 * 이미 org.db에 조직 데이터가 있으면(부서가 이미 있으면) 아무것도 하지 않고
 * 종료한다 - 실수로 두 번 실행해도 중복 생성되지 않는다.
 */

import path from "node:path";
import { PrismaClient, Role, AssigneeType, WorkOrderStatus, Priority } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ensureSchema } from "../src/lib/schema-init";
import { syncOrgInto } from "../src/lib/org-sync";

const MIGRATIONS_DIR = path.join(__dirname, "..", "prisma", "migrations");
const DEFAULT_PASSWORD = "password123";

type DivisionKey =
  | "철목정도과"
  | "설비과"
  | "외업도장과"
  | "선행도장과"
  | "통합공정과"
  | "안전운영과";

type ProjectKey = "TRION" | "RUYA" | "DH" | "OPS";

type StaffSeed = { name: string; email: string; role: Role; divisionKey?: DivisionKey };

type ItemSeed = {
  divisionKey: DivisionKey;
  projectKey: ProjectKey;
  title: string;
  priority?: Priority;
  dueDate?: string;
  status?: WorkOrderStatus;
  children?: string[];
};

const DIVISION_NAMES: DivisionKey[] = [
  "철목정도과",
  "설비과",
  "외업도장과",
  "선행도장과",
  "통합공정과",
  "안전운영과",
];

const STAFF: StaffSeed[] = [
  { name: "이재석", email: "leejs@hd.com", role: Role.DEPT_HEAD },
  { name: "Q5L0관리자", email: "g5l0a@bp.hd.com", role: Role.MEMBER },

  { name: "천홍민", email: "hongmincheon@hd.com", role: Role.DIV_HEAD, divisionKey: "선행도장과" },
  { name: "주종일", email: "jongil@hd.com", role: Role.MEMBER, divisionKey: "선행도장과" },
  { name: "정순욱", email: "jsw704@hd.com", role: Role.MEMBER, divisionKey: "선행도장과" },
  { name: "성기협", email: "sung0608@hd.com", role: Role.MEMBER, divisionKey: "선행도장과" },

  { name: "신경훈", email: "ghshin@hd.com", role: Role.DIV_HEAD, divisionKey: "안전운영과" },
  { name: "우남용", email: "true21c@hd.com", role: Role.MEMBER, divisionKey: "안전운영과" },

  { name: "신성필", email: "spshin@hd.com", role: Role.MEMBER, divisionKey: "설비과" },
  { name: "한성일", email: "sihan@hd.com", role: Role.MEMBER, divisionKey: "설비과" },
  { name: "김대성", email: "dae0179@hd.com", role: Role.DIV_HEAD, divisionKey: "설비과" },
  { name: "김재민", email: "kjmks33@hd.com", role: Role.MEMBER, divisionKey: "설비과" },

  { name: "허필훈", email: "hph@hd.com", role: Role.DIV_HEAD, divisionKey: "철목정도과" },
  { name: "이준석", email: "junslee@hd.com", role: Role.MEMBER, divisionKey: "철목정도과" },
  { name: "김성록", email: "ttyf99@hd.com", role: Role.MEMBER, divisionKey: "철목정도과" },

  { name: "김의택", email: "tech67@hd.com", role: Role.DIV_HEAD, divisionKey: "외업도장과" },
  { name: "정성운", email: "jsu3963@hd.com", role: Role.MEMBER, divisionKey: "외업도장과" },
  { name: "김재확", email: "jaehwak@hd.com", role: Role.MEMBER, divisionKey: "외업도장과" },
  { name: "유종탁", email: "yoot@hd.com", role: Role.MEMBER, divisionKey: "외업도장과" },

  { name: "황득근", email: "dghwang@hd.com", role: Role.DIV_HEAD, divisionKey: "통합공정과" },
  { name: "김규남", email: "gn.kim@hd.com", role: Role.MEMBER, divisionKey: "통합공정과" },
  { name: "김승용", email: "honestk@hd.com", role: Role.MEMBER, divisionKey: "통합공정과" },
  { name: "송미정", email: "mijungsong@hd.com", role: Role.MEMBER, divisionKey: "통합공정과" },
  { name: "윤지", email: "yunj@hd.com", role: Role.MEMBER, divisionKey: "통합공정과" },
];

const ITEMS: ItemSeed[] = [
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
  { divisionKey: "철목정도과", projectKey: "RUYA", title: "RUYA LEVEL4 Level Up 이후 SUP'T 방법 변경", priority: Priority.URGENT },
  { divisionKey: "철목정도과", projectKey: "RUYA", title: "RUYA ELEC. Building 탑재 준비: 매주 목요일 실시", dueDate: "2026-07-25" },
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
    children: ["LQ 잔여 작업 계획", "Hull 잔여 작업 계획", "Topside, Room final 작업 계획, 보온 작업 계획"],
  },
  { divisionKey: "외업도장과", projectKey: "TRION", title: "TRION HULL 일정 준수, 후속 수정작업 방안(부문장 보고)" },
  { divisionKey: "외업도장과", projectKey: "TRION", title: "TRION HULL 전체 잔여 작업 보고(부문장 보고): 외업5, 철목구조, 도장, 시운전" },
  {
    divisionKey: "외업도장과",
    projectKey: "TRION",
    title: "Production Deck 상하부 작업 방법",
    children: ["Deck 상부 장비 코팅 도장(진행 중)", "Deck 하부 Sky 작업", "Center UCF, SIDE UCF"],
  },
  { divisionKey: "외업도장과", projectKey: "TRION", title: "TRION Hull 완료 계획(통합공정과 최종 취합)", priority: Priority.URGENT },
  { divisionKey: "외업도장과", projectKey: "TRION", title: "TRION Tank 진수, Strength Test, Inclined Test 시 Tank 자재/배수 방법", priority: Priority.URGENT },
  { divisionKey: "외업도장과", projectKey: "RUYA", title: "Ruya Rope Man 5월 중 계획", status: WorkOrderStatus.IN_PROGRESS },
  { divisionKey: "외업도장과", projectKey: "OPS", title: "AI 업무 개선 -> 업무 처리방안 협의 필요" },
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
  { divisionKey: "선행도장과", projectKey: "DH", title: "중형선 D/H 작업 방법 검토", dueDate: "2026-07-31" },
  { divisionKey: "통합공정과", projectKey: "RUYA", title: "Ruya MC Setting(6월초) -> RFC F/U 방법 검토" },
  { divisionKey: "통합공정과", projectKey: "OPS", title: "신규 인원 포함 Work Scope 정리해서 보고" },
  { divisionKey: "통합공정과", projectKey: "TRION", title: "TRION HULL 전체 잔여 작업 보고(부문장 보고, 차주 TRION 공정 회의 시 보고): 외업5, 철목구조, 도장, 시운전" },
  {
    divisionKey: "안전운영과",
    projectKey: "OPS",
    title: "확보예산/예산투입/부족예산, 능률 취합",
    dueDate: "2026-12-31",
    children: ["기성 자료, 매주 월", "주간(1개월), 매월 말", "월간(1개월) + 협력사 기성 집행 현황"],
  },
  { divisionKey: "안전운영과", projectKey: "OPS", title: "ESG 활동 방안 취합" },
  { divisionKey: "안전운영과", projectKey: "OPS", title: "신입사원 OJT" },
  { divisionKey: "안전운영과", projectKey: "OPS", title: "하모니 데이 사전 준비 -> 잠정 중단", priority: Priority.LOW },
  { divisionKey: "안전운영과", projectKey: "OPS", title: "위험성 평가 점검 계획" },
];

async function main() {
  const nasRoot = process.argv[2];
  if (!nasRoot) {
    console.error('사용법: npx tsx scripts/init-real-data.ts "V:\\10. 외업도장과\\AI 프로젝트\\dev"');
    process.exit(1);
  }

  const orgDbPath = path.join(nasRoot, "org.db");
  await ensureSchema(orgDbPath, MIGRATIONS_DIR);
  const org = new PrismaClient({ datasourceUrl: `file:${orgDbPath}` });

  const existingDept = await org.department.findFirst();
  if (existingDept) {
    console.log("이미 조직 데이터가 있습니다(중복 실행 방지). 아무것도 하지 않고 종료합니다.");
    await org.$disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  // 조직 관리(/org: 부서/과/팀/계정 추가·삭제)는 ADMIN 권한 전용이라, 실제
  // 직원과 별개로 시스템 관리용 관리자 계정을 하나 만들어둔다.
  await org.user.create({
    data: {
      name: "관리자",
      email: "admin@company.com",
      passwordHash,
      role: Role.ADMIN,
    },
  });

  const dept = await org.department.create({ data: { name: "해양시스템공사부" } });

  const divisions = {} as Record<DivisionKey, { id: string; name: string }>;
  for (const name of DIVISION_NAMES) {
    divisions[name] = await org.division.create({ data: { name, departmentId: dept.id } });
  }

  for (const person of STAFF) {
    await org.user.create({
      data: {
        name: person.name,
        email: person.email,
        passwordHash,
        role: person.role,
        departmentId: dept.id,
        divisionId: person.divisionKey ? divisions[person.divisionKey].id : null,
      },
    });
  }

  const deptHead = await org.user.findUniqueOrThrow({ where: { email: "leejs@hd.com" } });

  const constructionCategory = await org.category.create({ data: { name: "건조 프로젝트", color: "#2563eb" } });
  const opsCategory = await org.category.create({ data: { name: "상시운영", color: "#64748b" } });

  const projectDefs: Record<ProjectKey, { name: string; categoryId: string }> = {
    TRION: { name: "TRION", categoryId: constructionCategory.id },
    RUYA: { name: "RUYA", categoryId: constructionCategory.id },
    DH: { name: "D/H (Deck House)", categoryId: constructionCategory.id },
    OPS: { name: "일반운영", categoryId: opsCategory.id },
  };
  const projects = {} as Record<ProjectKey, { id: string }>;
  for (const key of Object.keys(projectDefs) as ProjectKey[]) {
    projects[key] = await org.project.create({ data: projectDefs[key] });
  }

  await org.$disconnect();
  console.log(`org.db 생성 완료: 부서 1, 과 ${DIVISION_NAMES.length}, 직원 ${STAFF.length}명, 프로젝트 ${Object.keys(projectDefs).length}개`);

  // 과별로 items를 묶어서, 각 과 파일에 조직도를 동기화한 뒤 업무를 만든다.
  const itemsByDivision = new Map<DivisionKey, ItemSeed[]>();
  for (const item of ITEMS) {
    if (!itemsByDivision.has(item.divisionKey)) itemsByDivision.set(item.divisionKey, []);
    itemsByDivision.get(item.divisionKey)!.push(item);
  }

  for (const divisionKey of DIVISION_NAMES) {
    const divisionDbPath = path.join(nasRoot, `${divisionKey}.db`);
    await syncOrgInto(orgDbPath, divisionDbPath, MIGRATIONS_DIR);

    const items = itemsByDivision.get(divisionKey) ?? [];
    if (items.length === 0) continue;

    const client = new PrismaClient({ datasourceUrl: `file:${divisionDbPath}` });
    const divisionId = divisions[divisionKey].id;

    for (const item of items) {
      const projectId = projects[item.projectKey].id;
      const parent = await client.workOrder.create({
        data: {
          title: `${divisionKey}-${item.title}`,
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
        await client.workOrder.create({
          data: {
            title: childTitle,
            projectId,
            parentId: parent.id,
            assigneeType: AssigneeType.DIVISION,
            assignedDivId: divisionId,
            status: inProgress ? WorkOrderStatus.IN_PROGRESS : WorkOrderStatus.NOT_STARTED,
            createdById: deptHead.id,
          },
        });
      }
    }

    await client.$disconnect();
    console.log(`${divisionKey}.db 생성 완료: 업무 ${items.length}건(상위)`);
  }

  console.log("\n초기화 완료. 로그인 계정(비밀번호 공통: password123, 최초 로그인 후 /account 에서 변경 권장):");
  console.log("  admin@company.com  (관리자 - 조직 관리 전용)");
  for (const person of STAFF) {
    console.log(`  ${person.email}  (${person.name})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
