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

export type ActiveHolder = { name: string; email: string };

const globalForDb = globalThis as unknown as {
  __orgDb: PrismaClient | undefined;
  __activeClient: PrismaClient | undefined;
  __activeDbPath: string | undefined;
  __activeKey: string | undefined;
  __activeMode: ActiveMode | undefined;
  __activeHolder: ActiveHolder | undefined;
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

function getOrgDbClient(): PrismaClient {
  if (!globalForDb.__orgDb) {
    // resolveOrgDbPath()는 NAS_ROOT 등 런타임 환경변수가 필요한데, 이걸 여기
    // getter 안에서(=실제로 쿼리를 처음 날릴 때)만 호출해야 한다. 만약 모듈
    // 최상단에서 즉시 호출하면, `next build`가 라우트 모듈을 그냥 import만
    // 해도(핸들러를 실행하지 않아도) 이 코드가 평가되면서 "환경변수가 없다"는
    // 에러로 빌드 자체가 깨진다(실제로 한 번 발생했던 문제).
    globalForDb.__orgDb = new PrismaClient({
      datasourceUrl: `file:${resolveOrgDbPath()}`,
    });
  }
  return globalForDb.__orgDb;
}

/**
 * 조직도 원본(org.db)에 항상 고정으로 연결되는 클라이언트. 실제 PrismaClient는
 * 첫 사용 시점에만 만들어진다(위 이유).
 */
export const orgDb: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getOrgDbClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

/**
 * 현재 활성화된(체크아웃된) 과 파일 경로/키/모드/소유자를 바꾼다. 같은 경로면 클라이언트는
 * 재사용하고 메타데이터만 갱신한다.
 *
 * holder(누가 이 세션을 시작했는지)를 함께 저장해두는 이유: 이 활성 클라이언트는
 * Node 프로세스 전역 상태라서(한 PC = 한 사용자를 전제로 한 설계), 원칙적으로는
 * 한 프로세스에 한 명만 접속해 있어야 한다. 하지만 같은 브라우저/프로세스에서 계정을
 * 바꿔가며 테스트하는 경우처럼 여러 사용자가 실제로 한 프로세스를 거쳐가면, holder
 * 정보가 없으면 "지금 로그인한 사람"과 "실제로 편집을 시작한 사람"을 구분할 방법이
 * 없어서, 다른 사람이 남의 편집 세션을 그대로 저장/취소해버릴 수 있다.
 */
export function setActiveDb(
  dbPath: string,
  key: string,
  mode: ActiveMode,
  holder: ActiveHolder,
): void {
  if (globalForDb.__activeDbPath === dbPath && globalForDb.__activeClient) {
    globalForDb.__activeKey = key;
    globalForDb.__activeMode = mode;
    globalForDb.__activeHolder = holder;
    return;
  }
  const old = globalForDb.__activeClient;
  globalForDb.__activeClient = new PrismaClient({
    datasourceUrl: `file:${dbPath}`,
  });
  globalForDb.__activeDbPath = dbPath;
  globalForDb.__activeKey = key;
  globalForDb.__activeMode = mode;
  globalForDb.__activeHolder = holder;
  if (old) {
    void old.$disconnect();
  }
}

export function getActiveDbPath(): string | null {
  return globalForDb.__activeDbPath ?? null;
}

export type ActiveContextInfo = {
  key: string;
  mode: ActiveMode;
  holder: ActiveHolder;
};

/** 현재 어떤 과를 어떤 모드(편집/보기)로, 누가 열어 두었는지. 아무것도 안 열려 있으면 null. */
export function getActiveContextInfo(): ActiveContextInfo | null {
  if (!globalForDb.__activeKey || !globalForDb.__activeMode || !globalForDb.__activeHolder) {
    return null;
  }
  return {
    key: globalForDb.__activeKey,
    mode: globalForDb.__activeMode,
    holder: globalForDb.__activeHolder,
  };
}

export function clearActiveDb(): void {
  const old = globalForDb.__activeClient;
  globalForDb.__activeClient = undefined;
  globalForDb.__activeDbPath = undefined;
  globalForDb.__activeKey = undefined;
  globalForDb.__activeMode = undefined;
  globalForDb.__activeHolder = undefined;
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
