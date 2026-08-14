/**
 * 여러 과 파일에 걸쳐 읽기 전용으로 조회해야 하는 경우(부서 전체 집계,
 * "이 사용자가 어딘가에 업무를 만든 적 있는지" 안전 확인 등)를 위한 헬퍼.
 *
 * 각 과 파일을 잠금 없이 읽기 전용으로 체크아웃(nas-store)한 뒤, 파일마다
 * 짧게 연결해서 콜백을 실행하고 바로 연결을 끊는다. 잠금을 걸지 않으므로
 * 동시에 몇 명이 호출해도 서로 방해하지 않는다.
 */

import { PrismaClient } from "@prisma/client";
import { NasStore } from "./nas-store";
import { ensureSchema } from "./schema-init";

export type MultiDivisionResult<T> = {
  key: string;
  value: T;
};

export async function queryAllDivisions<T>(
  store: NasStore,
  divisionKeys: string[],
  migrationsDir: string,
  queryFn: (client: PrismaClient, key: string) => Promise<T>,
): Promise<MultiDivisionResult<T>[]> {
  const readonlyPaths = store.checkoutReadOnly(divisionKeys);
  const results: MultiDivisionResult<T>[] = [];

  for (const key of divisionKeys) {
    const dbPath = readonlyPaths[key];
    if (!dbPath) continue; // 아직 한 번도 체크인된 적 없는 과(원본 파일 없음)

    await ensureSchema(dbPath, migrationsDir);
    const client = new PrismaClient({ datasourceUrl: `file:${dbPath}` });
    try {
      const value = await queryFn(client, key);
      results.push({ key, value });
    } finally {
      await client.$disconnect();
    }
  }

  return results;
}
