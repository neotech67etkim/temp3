/**
 * 과 파일이 저장될 때마다, 그 과의 업무 현황/변경 이력을 Copilot이 읽기 좋은
 * Markdown 문서로 같은 데이터 폴더 위(copilot-export/)에 함께 써둔다.
 *
 * 이 앱은 SharePoint에 직접 올리지 않는다 - 그건 별도로 정해질 절차(사람이
 * 수동으로 올리거나, 별도 동기화 작업)의 몫이다. 여기서는 그 절차가 그대로
 * 집어 올릴 수 있는 "소스 파일"만 최신 상태로 유지한다.
 *
 * 파일 하나당 과 하나(예: 외업도장과.md, 외업도장과-변경이력.md) - 현재 상태와
 * 변경 이력을 분리해서, 상태만 궁금한 질문과 "그동안 뭐가 바뀌었어" 같은
 * 이력 질문 양쪽에 각각 맞는 문서를 붙여줄 수 있게 한다.
 */

import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { STATUS_LABEL } from "@/components/status-badge";
import { PRIORITY_LABEL } from "@/components/priority-badge";
import { formatAssignee } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/org-access";

function exportDir(dataDir: string): string {
  return path.join(dataDir, "copilot-export");
}

function formatDate(d: Date | null): string {
  return d ? d.toLocaleDateString("ko-KR") : "(없음)";
}

function formatDateTime(d: Date): string {
  return d.toLocaleString("ko-KR");
}

/** 과 하나의 "현재 업무 현황" Markdown 문서를 생성해 쓴다. */
async function writeStateDoc(client: PrismaClient, key: string, dir: string): Promise<void> {
  const workOrders = await client.workOrder.findMany({
    include: {
      project: { select: { name: true } },
      createdBy: { select: { name: true } },
      assignedDept: { select: { name: true } },
      assignedDiv: { select: { name: true } },
      assignedTeam: { select: { name: true } },
      assignedUser: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const titleById = new Map(workOrders.map((w) => [w.id, w.title]));

  const lines: string[] = [
    `# ${key} 업무 현황`,
    "",
    `기준 시각: ${formatDateTime(new Date())}`,
    `전체 업무 수: ${workOrders.length}건`,
    "",
  ];

  for (const w of workOrders) {
    lines.push(`## ${w.title}`);
    lines.push(`- 프로젝트: ${w.project.name}`);
    lines.push(`- 상태: ${STATUS_LABEL[w.status]}`);
    lines.push(`- 우선순위: ${PRIORITY_LABEL[w.priority]}`);
    lines.push(`- 진행률: ${w.progress}%`);
    lines.push(`- 지시자: ${w.createdBy.name}`);
    lines.push(`- 담당: ${formatAssignee(w)}`);
    lines.push(`- 마감일: ${formatDate(w.dueDate)}`);
    lines.push(`- 완료일: ${formatDate(w.completedAt)}`);
    lines.push(`- 이관됨: ${w.transferred ? "예" : "아니오"}`);
    if (w.parentId) {
      const parentTitle = titleById.get(w.parentId);
      lines.push(
        parentTitle
          ? `- 상위 업무: ${parentTitle}`
          : "- 상위 업무: 다른 과 소속 업무 (이 문서 범위 밖)",
      );
    }
    if (w.description) {
      lines.push(`- 업무내용 및 참고사항: ${w.description.replace(/\n/g, " ")}`);
    }
    lines.push("");
  }

  fs.writeFileSync(path.join(dir, `${key}.md`), lines.join("\n"), "utf-8");
}

/** 과 하나의 "전체 변경 이력" Markdown 문서를 생성해 쓴다(최신순). */
async function writeChangeLogDoc(client: PrismaClient, key: string, dir: string): Promise<void> {
  const logs = await client.workOrderLog.findMany({
    include: {
      author: { select: { name: true } },
      workOrder: { select: { title: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const lines: string[] = [
    `# ${key} 변경 이력`,
    "",
    `기준 시각: ${formatDateTime(new Date())}`,
    `전체 기록 수: ${logs.length}건`,
    "",
  ];

  for (const log of logs) {
    lines.push(`## ${formatDateTime(log.createdAt)} · ${log.author.name} · ${log.workOrder.title}`);
    if (log.progress !== null) lines.push(`- 진행률 변경: ${log.progress}%`);
    if (log.note) lines.push(`- 내용: ${log.note.replace(/\n/g, " ")}`);
    if (log.imagePath) lines.push("- 첨부: 스크린샷 있음");
    if (log.filePath) lines.push("- 첨부: 파일 있음");
    lines.push("");
  }

  fs.writeFileSync(path.join(dir, `${key}-변경이력.md`), lines.join("\n"), "utf-8");
}

/**
 * 과 하나의 export 문서(현황 + 변경이력)를 갱신한다. 이 과 파일에 이미 연결된
 * 클라이언트를 그대로 재사용하므로 별도 DB 연결을 만들지 않는다. 실패해도
 * 저장 자체를 막으면 안 되므로, 호출하는 쪽에서 실패를 삼키고 로그만 남기는
 * 방식으로 쓴다.
 */
export async function exportDivisionForCopilot(
  client: PrismaClient,
  key: string,
  dataDir: string,
): Promise<void> {
  const dir = exportDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  await Promise.all([writeStateDoc(client, key, dir), writeChangeLogDoc(client, key, dir)]);
}

/**
 * 조직도(부서 → 과 → 팀 → 개인)를 Markdown 문서(copilot-export/조직도.md)로
 * 써둔다. org.db는 조직 관리(/org) 화면에서 부서/과/팀/사용자를 추가·삭제할
 * 때마다 바뀌므로, 그 시점마다 호출해서 갱신한다(actions/org.ts).
 * 비밀번호 해시 등 민감한 필드는 당연히 포함하지 않는다.
 */
export async function exportOrgForCopilot(
  orgClient: PrismaClient,
  dataDir: string,
): Promise<void> {
  const [departments, divisions, teams, users] = await Promise.all([
    orgClient.department.findMany({ orderBy: { name: "asc" } }),
    orgClient.division.findMany({ orderBy: { name: "asc" } }),
    orgClient.team.findMany({ orderBy: { name: "asc" } }),
    orgClient.user.findMany({
      select: {
        name: true,
        email: true,
        role: true,
        departmentId: true,
        divisionId: true,
        teamId: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const usersByTeam = new Map<string, typeof users>();
  const usersByDivisionNoTeam = new Map<string, typeof users>();
  const usersByDeptOnly = new Map<string, typeof users>();
  for (const u of users) {
    if (u.teamId) {
      usersByTeam.set(u.teamId, [...(usersByTeam.get(u.teamId) ?? []), u]);
    } else if (u.divisionId) {
      usersByDivisionNoTeam.set(u.divisionId, [
        ...(usersByDivisionNoTeam.get(u.divisionId) ?? []),
        u,
      ]);
    } else if (u.departmentId) {
      usersByDeptOnly.set(u.departmentId, [
        ...(usersByDeptOnly.get(u.departmentId) ?? []),
        u,
      ]);
    }
  }

  const lines: string[] = [
    "# 조직도",
    "",
    `기준 시각: ${formatDateTime(new Date())}`,
    `부서 ${departments.length}개 · 과 ${divisions.length}개 · 팀 ${teams.length}개 · 인원 ${users.length}명`,
    "",
  ];

  const formatUser = (u: { name: string; email: string; role: string }) =>
    `  - ${u.name} (${ROLE_LABEL[u.role as keyof typeof ROLE_LABEL] ?? u.role}, ${u.email})`;

  for (const dept of departments) {
    lines.push(`## ${dept.name}`);
    for (const u of usersByDeptOnly.get(dept.id) ?? []) lines.push(formatUser(u));

    for (const div of divisions.filter((d) => d.departmentId === dept.id)) {
      lines.push(`### ${div.name}`);
      for (const u of usersByDivisionNoTeam.get(div.id) ?? []) lines.push(formatUser(u));

      for (const team of teams.filter((t) => t.divisionId === div.id)) {
        lines.push(`#### ${team.name}`);
        for (const u of usersByTeam.get(team.id) ?? []) lines.push(formatUser(u));
      }
    }
    lines.push("");
  }

  const dir = exportDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "조직도.md"), lines.join("\n"), "utf-8");
}
