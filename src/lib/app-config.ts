import path from "node:path";
import { NasStore, type NasStoreConfig } from "./nas-store";

/**
 * NAS_ROOT: 원본 저장 위치(회사 NAS 공유 폴더, UNC 경로 또는 마운트된 드라이브).
 * LOCAL_WORKSPACE_ROOT: 체크아웃한 파일을 실제로 여는 로컬 작업 디렉터리.
 * 둘 다 없으면 개발 중 임시 폴더로 fallback.
 */
export function getNasStoreConfig(): NasStoreConfig {
  const nasRoot = process.env.NAS_ROOT ?? path.join(process.cwd(), ".dev-nas");
  const localRoot =
    process.env.LOCAL_WORKSPACE_ROOT ?? path.join(process.cwd(), ".dev-local");
  return { nasRoot, localRoot };
}

let cachedStore: NasStore | null = null;

/** 앱 전역에서 재사용하는 NasStore 싱글턴. */
export function getNasStore(): NasStore {
  if (!cachedStore) {
    cachedStore = new NasStore(getNasStoreConfig());
  }
  return cachedStore;
}

export function getMigrationsDir(): string {
  return process.env.PRISMA_MIGRATIONS_DIR ?? path.join(process.cwd(), "prisma", "migrations");
}
