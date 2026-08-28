import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { getDataDir } from "@/lib/app-config";

/**
 * 조직도/계정/업무영역/프로젝트의 원본(org.db)에 항상 고정으로 연결되는
 * 클라이언트. 과별 WorkOrder 파일은 lib/division-db.ts가 담당한다.
 */

const globalForDb = globalThis as unknown as {
  __orgDb: PrismaClient | undefined;
};

export function resolveOrgDbPath(): string {
  // ORG_DB_PATH를 명시적으로 지정했으면 그걸 우선 사용.
  const explicit = process.env.ORG_DB_PATH;
  if (explicit) return explicit;
  return path.join(getDataDir(), "org.db");
}

function getOrgDbClient(): PrismaClient {
  if (!globalForDb.__orgDb) {
    // resolveOrgDbPath()는 런타임 환경변수가 필요한데, 이걸 여기 getter
    // 안에서(=실제로 쿼리를 처음 날릴 때)만 호출해야 한다. 모듈 최상단에서
    // 즉시 호출하면 `next build`가 라우트 모듈을 그냥 import만 해도 이
    // 코드가 평가되면서 에러로 빌드 자체가 깨진다(실제로 한 번 발생했던 문제).
    globalForDb.__orgDb = new PrismaClient({
      datasourceUrl: `file:${resolveOrgDbPath()}`,
    });
  }
  return globalForDb.__orgDb;
}

export const orgDb: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getOrgDbClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
