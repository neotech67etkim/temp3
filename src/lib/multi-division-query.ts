/**
 * 여러 과 파일에 걸쳐 조회(부서 전체 집계, 특정 id가 어느 과에 있는지 찾기 등)해야
 * 하는 경우를 위한 헬퍼. 각 과 파일은 서버가 계속 열어두는 연결(division-db.ts)을
 * 그대로 재사용한다.
 */

import { PrismaClient } from "@prisma/client";
import { getDivisionDb } from "./division-db";

export type MultiDivisionResult<T> = {
  key: string;
  value: T;
};

export async function queryAllDivisions<T>(
  divisionKeys: string[],
  queryFn: (client: PrismaClient, key: string) => Promise<T>,
): Promise<MultiDivisionResult<T>[]> {
  const results: MultiDivisionResult<T>[] = [];
  for (const key of divisionKeys) {
    const client = await getDivisionDb(key);
    const value = await queryFn(client, key);
    results.push({ key, value });
  }
  return results;
}
