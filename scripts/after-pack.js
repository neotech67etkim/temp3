// electron-builder afterPack 훅.
//
// electron-builder는 "node_modules/**/*" 같은 패턴을 만나면 단순 glob 복사가
// 아니라 자체적인 "스마트" node_modules 정리(의존성 그래프 기반 정리)를
// 적용하는데, 이 로직이 점(.)으로 시작하는 폴더(node_modules/.prisma,
// node_modules/.bin 등)를 filter에 명시적으로 추가해도 계속 빼버린다
// (extraResources.filter에 "node_modules/.prisma/**/*"를 추가해봤지만 실제
// 패키징 결과에 반영되지 않는 걸 직접 확인함).
//
// node_modules/.prisma/client는 `prisma generate`가 만드는 실제 생성
// 코드라서 이게 빠지면 런타임에 "Cannot find module '.prisma/client/default'"
// 로 죽는다. glob 패턴으로 싸우는 대신, 패키징이 끝난 뒤 그냥 직접 복사해서
// 확실하게 넣는다.

const fs = require("node:fs");
const path = require("node:path");

module.exports = async function afterPack(context) {
  const src = path.join(__dirname, "..", "node_modules", ".prisma");
  if (!fs.existsSync(src)) {
    console.warn(
      "[after-pack] node_modules/.prisma가 없습니다. 빌드 전에 `npx prisma generate`(또는 npm ci)를 먼저 실행했는지 확인하세요.",
    );
    return;
  }

  const resourcesDir =
    context.electronPlatformName === "darwin"
      ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
      : path.join(context.appOutDir, "resources");
  const dest = path.join(resourcesDir, "app", "node_modules", ".prisma");

  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`[after-pack] node_modules/.prisma 복사 완료: ${dest}`);
};
