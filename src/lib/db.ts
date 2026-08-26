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

export type UnavailableDivision = { key: string; holderName: string };

type HeldEntry = { client: PrismaClient; dbPath: string };

const globalForDb = globalThis as unknown as {
  __orgDb: PrismaClient | undefined;
  __held: Map<string, HeldEntry> | undefined;
  __currentKey: string | undefined;
  __mode: ActiveMode | undefined;
  __holder: ActiveHolder | undefined;
  __unavailable: UnavailableDivision[] | undefined;
};

function heldMap(): Map<string, HeldEntry> {
  if (!globalForDb.__held) globalForDb.__held = new Map();
  return globalForDb.__held;
}

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
 * 편집/열람 세션에 과 하나를 추가로 연다(이미 열려 있으면 그대로 재사용하고
 * "지금 prisma가 가리키는 대상"만 이 과로 옮긴다).
 *
 * 예전에는 이 프로세스가 한 번에 딱 하나의 과 파일만 붙잡을 수 있었다. 하지만
 * 부서장처럼 여러 과를 동시에 관리하는 사람이 업무마다 매번 "편집 시작"을
 * 새로 눌러야 하는 게 번거로워서, 이제는 여러 과를 동시에 "보유"할 수 있고
 * (held), 그중 어느 것으로 실제 쿼리를 보낼지만 currentKey로 전환한다.
 *
 * holder(누가 이 세션을 시작했는지)를 함께 저장해두는 이유: 이 상태는 Node
 * 프로세스 전역이라서(한 PC = 한 사용자를 전제로 한 설계), 같은 브라우저/
 * 프로세스에서 계정을 바꿔가며 테스트하는 경우처럼 여러 사용자가 실제로 한
 * 프로세스를 거쳐가면 holder 정보가 없으면 "지금 로그인한 사람"과 "실제로
 * 편집을 시작한 사람"을 구분할 방법이 없어서, 다른 사람이 남의 편집 세션을
 * 그대로 저장/취소해버릴 수 있다.
 */
export function openHeldDivision(
  key: string,
  dbPath: string,
  mode: ActiveMode,
  holder: ActiveHolder,
): void {
  const held = heldMap();

  // 방어적 안전장치: 이미 다른 사람이 이 프로세스에서 뭔가를 보유 중인데
  // 그와 다른 holder로 여기 도달하면(원래는 각 액션의 "processBlockedByOther"
  // 체크가 미리 막아줘야 함), __holder를 조용히 덮어쓰지 않고 크게 실패시킨다.
  // 조용히 덮어쓰면 held 맵에는 실제로는 서로 다른 사람이 각자 잠근 과들이
  // 섞여 있는데 __holder 하나로만 전체를 대표하게 되어, 그 이후로 "누가
  // 편집 중인지"가 화면마다 뒤죽박죽으로 보이는 상태가 되어버린다(실제로
  // 같은 프로세스에서 계정을 바꿔가며 테스트하다가 이 증상이 보고됨).
  if (
    held.size > 0 &&
    globalForDb.__holder &&
    globalForDb.__holder.email !== holder.email
  ) {
    throw new Error(
      `이 프로그램은 지금 ${globalForDb.__holder.name}님의 편집 세션을 들고 있어서, ${holder.name}님으로 새로 열 수 없습니다. 먼저 그 세션을 저장/취소로 마쳐야 합니다.`,
    );
  }

  const existing = held.get(key);
  if (!existing || existing.dbPath !== dbPath) {
    if (existing) void existing.client.$disconnect();
    held.set(key, { client: new PrismaClient({ datasourceUrl: `file:${dbPath}` }), dbPath });
  }
  globalForDb.__currentKey = key;
  globalForDb.__mode = mode;
  globalForDb.__holder = holder;
}

/** 이미 보유 중인 과들 중 하나로 "지금 prisma가 가리키는 대상"만 바꾼다(새로 열거나 잠그지 않음). */
export function switchCurrentDivision(key: string): boolean {
  if (!heldMap().has(key)) return false;
  globalForDb.__currentKey = key;
  return true;
}

export function isDivisionHeld(key: string): boolean {
  return heldMap().has(key);
}

/** 이 키로 이미 열려 있는 클라이언트를 직접 가져온다(여러 과를 뒤져서 id가 어디
 *  있는지 찾을 때처럼, "지금 가리키는 대상"과 무관하게 개별 과에 접근해야 할 때 씀). */
export function getHeldClient(key: string): PrismaClient | null {
  return heldMap().get(key)?.client ?? null;
}

export function getActiveDbPath(): string | null {
  const key = globalForDb.__currentKey;
  if (!key) return null;
  return heldMap().get(key)?.dbPath ?? null;
}

export type ActiveContextInfo = {
  /** 지금 보유 중인 모든 과. */
  keys: string[];
  /** 그중 지금 prisma가 실제로 가리키는 과. */
  currentKey: string | null;
  mode: ActiveMode;
  holder: ActiveHolder;
};

/** 지금 어떤 과들을 어떤 모드(편집/보기)로, 누가 열어 두었는지. 아무것도 안 열려 있으면 null. */
export function getActiveContextInfo(): ActiveContextInfo | null {
  const held = heldMap();
  if (held.size === 0 || !globalForDb.__mode || !globalForDb.__holder) return null;
  return {
    keys: [...held.keys()],
    currentKey: globalForDb.__currentKey ?? null,
    mode: globalForDb.__mode,
    holder: globalForDb.__holder,
  };
}

/** 과 하나만 닫는다(저장/취소 뒤 호출). 보유한 과가 더 이상 없으면 세션 전체가 정리된다. */
export function closeHeldDivision(key: string): void {
  const held = heldMap();
  const entry = held.get(key);
  if (entry) {
    void entry.client.$disconnect();
    held.delete(key);
  }
  if (globalForDb.__currentKey === key) {
    globalForDb.__currentKey = held.size > 0 ? [...held.keys()][0] : undefined;
  }
  if (held.size === 0) {
    globalForDb.__mode = undefined;
    globalForDb.__holder = undefined;
  }
}

export function closeAllHeldDivisions(): void {
  for (const key of [...heldMap().keys()]) closeHeldDivision(key);
}

/** "전체 편집 시작"에서 이번에 못 연 과(다른 사람이 편집 중)를 기록해둔다 -
 *  select-division/nav 화면에서 "OOO가 편집중입니다"로 보여주기 위함. */
export function setUnavailableDivisions(list: UnavailableDivision[]): void {
  globalForDb.__unavailable = list;
}

export function getUnavailableDivisions(): UnavailableDivision[] {
  return globalForDb.__unavailable ?? [];
}

function requireActiveClient(): PrismaClient {
  const key = globalForDb.__currentKey;
  const entry = key ? heldMap().get(key) : undefined;
  if (!entry) {
    throw new Error(
      "아직 편집/열람할 과 파일이 선택되지 않았습니다. 먼저 과를 체크아웃하세요.",
    );
  }
  return entry.client;
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
