import path from "node:path";

/**
 * DATA_DIR: 과별 SQLite 파일(org.db 포함)이 저장되는 위치. 상시 켜진 서버
 * 자신의 로컬 디스크 경로면 충분하다(예전처럼 NAS 공유 폴더일 필요는 없지만,
 * 같은 이름의 폴더를 그대로 계속 써도 무방하다). NAS_ROOT는 이전 버전과의
 * 호환을 위한 별칭이다.
 */
export function getDataDir(): string {
  return (
    process.env.DATA_DIR ??
    process.env.NAS_ROOT ??
    path.join(process.cwd(), ".dev-data")
  );
}

export function getMigrationsDir(): string {
  return process.env.PRISMA_MIGRATIONS_DIR ?? path.join(process.cwd(), "prisma", "migrations");
}
