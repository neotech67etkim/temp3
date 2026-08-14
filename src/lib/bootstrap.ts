/**
 * 완전히 새로운 NAS 폴더로 처음 실행됐을 때(org.db가 아직 없거나 비어있을 때)
 * 최소한의 상태를 만들어준다: 스키마 적용 + 로그인할 수 있는 계정이 하나도
 * 없으면 기본 관리자 계정을 하나 만든다. 이게 없으면 org.db가 비어있는 상태로
 * 첫 로그인 시도 자체가 "테이블이 없습니다" 에러로 실패한다.
 *
 * 프로세스당 한 번만 실행되도록 memoize한다(로그인 API 라우트와 일반 페이지
 * 양쪽에서 호출되므로).
 */

import bcrypt from "bcryptjs";
import { orgDb, resolveOrgDbPath } from "./db";
import { ensureSchema } from "./schema-init";
import { getMigrationsDir } from "./app-config";

export const DEFAULT_ADMIN_EMAIL = "admin@local";
export const DEFAULT_ADMIN_PASSWORD = "admin1234";

let bootstrapPromise: Promise<void> | null = null;

async function bootstrap(): Promise<void> {
  await ensureSchema(resolveOrgDbPath(), getMigrationsDir());

  const userCount = await orgDb.user.count();
  if (userCount === 0) {
    const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
    await orgDb.user.create({
      data: {
        email: DEFAULT_ADMIN_EMAIL,
        name: "관리자",
        role: "ADMIN",
        passwordHash,
      },
    });
    console.log(
      `[bootstrap] org.db가 비어있어 기본 관리자 계정을 생성했습니다: ${DEFAULT_ADMIN_EMAIL} / ${DEFAULT_ADMIN_PASSWORD} (로그인 후 반드시 비밀번호를 바꾸고 실제 조직도를 등록하세요)`,
    );
  }
}

export function ensureOrgDbReady(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrap().catch((err) => {
      bootstrapPromise = null; // 실패하면 다음 요청에서 다시 시도할 수 있게
      throw err;
    });
  }
  return bootstrapPromise;
}
