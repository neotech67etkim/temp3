import path from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * 이 앱은 이제 하나의 공유 DB가 아니라 여러 SQLite 파일을 다룬다:
 * - orgDb: 조직도/계정/업무영역/프로젝트의 원본(org.db). 항상 고정.
 * - prisma: "현재 체크아웃된 과 파일"을 가리키는 스위처블 클라이언트.
 *   기존의 모든 Server Action/페이지가 `import { prisma } from "@/lib/db"`를
 *   그대로 쓸 수 있도록, 내부적으로 현재 활성화된 클라이언트로 위임하는 Proxy로 만든다.
 *   (division-scoped 코드를 한 줄도 안 건드리기 위한 핵심 트릭)
 */

export type ActiveMode = "edit" | "readonly";

const globalForDb = globalThis as unknown as {
  __orgDb: PrismaClient | undefined;
  __activeClient: PrismaClient | undefined;
  __activeDbPath: string | undefined;
  __activeKey: string | undefined;
  __activeMode: ActiveMode | undefined;
};

export function resolveOrgDbPath(): string {
  // ORG_DB_PATH를 명시적으로 지정했으면 그걸 우선 사용.
  const explicit = process.env.ORG_DB_PATH;
  if (explicit) return explicit;
  // 아니면 NAS_ROOT(NasStore와 동일한 원본 폴더)를 기준으로 org.db를 유도한다 -
  // NasStore의 org 키 파일 경로(remoteDbPath("org"))와 항상 같은 파일을 가리키게 하기 위함.
  const nasRoot = process.env.NAS_ROOT;
  if (nasRoot) return path.join(nasRoot, "org.db");
  // 개발 중 fallback: DATABASE_URL이 file: 형식이면 그걸 org.db로 간주
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("file:")) return url.slice("file:".length);
  throw new Error(
    "ORG_DB_PATH 또는 NAS_ROOT 환경변수가 설정되어 있지 않습니다(조직도 원본 파일 경로).",
  );
}

export const orgDb: PrismaClient =
  globalForDb.__orgDb ??
  new PrismaClient({ datasourceUrl: `file:${resolveOrgDbPath()}` });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__orgDb = orgDb;
}

/** 현재 활성화된(체크아웃된) 과 파일 경로/키/모드를 바꾼다. 같은 경로면 아무것도 안 함. */
export function setActiveDb(dbPath: string, key: string, mode: ActiveMode): void {
  if (globalForDb.__activeDbPath === dbPath && globalForDb.__activeClient) {
    globalForDb.__activeKey = key;
    globalForDb.__activeMode = mode;
    return;
  }
  const old = globalForDb.__activeClient;
  globalForDb.__activeClient = new PrismaClient({
    datasourceUrl: `file:${dbPath}`,
  });
  globalForDb.__activeDbPath = dbPath;
  globalForDb.__activeKey = key;
  globalForDb.__activeMode = mode;
  if (old) {
    void old.$disconnect();
  }
}

export function getActiveDbPath(): string | null {
  return globalForDb.__activeDbPath ?? null;
}

export type ActiveContextInfo = { key: string; mode: ActiveMode };

/** 현재 어떤 과를 어떤 모드(편집/보기)로 열어 두었는지. 아무것도 안 열려 있으면 null. */
export function getActiveContextInfo(): ActiveContextInfo | null {
  if (!globalForDb.__activeKey || !globalForDb.__activeMode) return null;
  return { key: globalForDb.__activeKey, mode: globalForDb.__activeMode };
}

export function clearActiveDb(): void {
  const old = globalForDb.__activeClient;
  globalForDb.__activeClient = undefined;
  globalForDb.__activeDbPath = undefined;
  globalForDb.__activeKey = undefined;
  globalForDb.__activeMode = undefined;
  if (old) void old.$disconnect();
}

function requireActiveClient(): PrismaClient {
  if (!globalForDb.__activeClient) {
    throw new Error(
      "아직 편집/열람할 과 파일이 선택되지 않았습니다. 먼저 과를 체크아웃하세요.",
    );
  }
  return globalForDb.__activeClient;
}

/**
 * "현재 체크아웃된 과 파일"을 가리키는 프록시. 기존 코드가
 * `import { prisma } from "@/lib/db"` 형태로 그대로 쓸 수 있게 유지한다.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = requireActiveClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
