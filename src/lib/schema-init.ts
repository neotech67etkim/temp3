/**
 * 새로 만들어지는 SQLite 파일(과별 파일, org.db)에 테이블 구조를 적용하는 헬퍼.
 * prisma/migrations의 최초(init) 마이그레이션 SQL을 그대로 재사용해서,
 * 런타임에 별도 Prisma CLI 없이도 빈 파일에 스키마를 만들 수 있게 한다.
 */

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

function findInitMigrationSql(migrationsDir: string): string {
  const entries = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  if (entries.length === 0) {
    throw new Error(`마이그레이션 폴더에 init 마이그레이션이 없습니다: ${migrationsDir}`);
  }

  const initDir = entries[0];
  return fs.readFileSync(path.join(migrationsDir, initDir, "migration.sql"), "utf-8");
}

function splitStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 대상 sqlite 파일에 WorkOrder 테이블이 없으면(=아직 스키마가 없는 새 파일이면)
 * init 마이그레이션 SQL을 적용해서 전체 스키마를 만든다. 이미 있으면 아무것도 안 함.
 */
export async function ensureSchema(
  dbPath: string,
  migrationsDir: string,
): Promise<void> {
  const client = new PrismaClient({ datasourceUrl: `file:${dbPath}` });
  try {
    const tables = await client.$queryRawUnsafe<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='WorkOrder'",
    );
    if (tables.length > 0) return;

    const sql = findInitMigrationSql(migrationsDir);
    const statements = splitStatements(sql);
    for (const statement of statements) {
      await client.$executeRawUnsafe(statement);
    }
  } finally {
    await client.$disconnect();
  }
}
