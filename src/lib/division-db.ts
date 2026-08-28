/**
 * 과별 SQLite 파일(<DATA_DIR>/<key>.db)에 대한 접근을 담당하는 모듈.
 *
 * 이 앱은 상시 켜진 서버 하나가 모든 요청을 처리한다(더 이상 여러 PC가 같은
 * 파일에 동시에 접근하는 구조가 아니다) - 그래서 예전처럼 잠금 파일을 걸고,
 * 로컬로 체크아웃해서 편집한 뒤 다시 원본에 체크인하는 절차가 필요 없다.
 * 각 과 파일을 서버 프로세스가 직접, 계속 열어두고 쓰면 된다(org.db를
 * 다루는 방식과 동일).
 */

import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { getDataDir, getMigrationsDir } from "@/lib/app-config";
import { ensureSchema } from "@/lib/schema-init";
import { syncOrgInto } from "@/lib/org-sync";
import { resolveOrgDbPath } from "@/lib/db";

const globalForDivisionDb = globalThis as unknown as {
  __divisionClients: Map<string, PrismaClient> | undefined;
};

function cache(): Map<string, PrismaClient> {
  if (!globalForDivisionDb.__divisionClients) {
    globalForDivisionDb.__divisionClients = new Map();
  }
  return globalForDivisionDb.__divisionClients;
}

export function divisionDbPath(key: string): string {
  return path.join(getDataDir(), `${key}.db`);
}

/**
 * 이 과 파일에 연결된 PrismaClient를 가져온다. 처음 접근하는 과라면 스키마를
 * 적용하고 org.db의 조직도(부서/과/팀/사용자 등) 미러를 채워 넣은 뒤 연결을
 * 캐싱한다 - 이후로는 org.ts의 조직 변경 액션이 resyncOrgToOpenDivisions로
 * 최신 상태를 계속 반영해준다.
 */
export async function getDivisionDb(key: string): Promise<PrismaClient> {
  const existing = cache().get(key);
  if (existing) return existing;

  const dbPath = divisionDbPath(key);
  const migrationsDir = getMigrationsDir();
  await ensureSchema(dbPath, migrationsDir);
  await syncOrgInto(resolveOrgDbPath(), dbPath, migrationsDir);

  const client = new PrismaClient({ datasourceUrl: `file:${dbPath}` });
  cache().set(key, client);
  return client;
}

/**
 * 조직도(부서/과/팀/사용자)가 바뀔 때마다(actions/org.ts) 이미 열려 있는 과
 * 파일들에도 최신 내용을 반영한다. 아직 한 번도 열린 적 없는 과는 다음에
 * getDivisionDb가 처음 호출될 때 스스로 최신 상태로 만들어지므로 여기서
 * 신경 쓸 필요 없다.
 */
export async function resyncOrgToOpenDivisions(): Promise<void> {
  const migrationsDir = getMigrationsDir();
  const orgPath = resolveOrgDbPath();
  await Promise.all(
    [...cache().keys()].map((key) => syncOrgInto(orgPath, divisionDbPath(key), migrationsDir)),
  );
}
