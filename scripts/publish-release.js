#!/usr/bin/env node
// dist/ 아래 만들어진 설치 파일을 NAS의 releases/ 폴더로 옮기고,
// 각 PC의 프로그램이 "새 버전 있음"을 알 수 있도록 releases/latest.json을
// 갱신한다. Windows에서 `npm run dist:win`으로 설치 파일을 만든 다음
// 실행한다.
//
// 사용법: node scripts/publish-release.js <releases 폴더 경로> ["릴리스 노트"]
//   예: node scripts/publish-release.js "V:\10. 외업도장과\AI 프로젝트\dev\releases" "편집 잠금 자동 해제 개선"

const fs = require("node:fs");
const path = require("node:path");

const releasesDir = process.argv[2];
const notes = process.argv[3] ?? "";

if (!releasesDir) {
  console.error("사용법: node scripts/publish-release.js <releases 폴더 경로> [\"릴리스 노트\"]");
  process.exit(1);
}

const repoRoot = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf-8"));
const version = pkg.version;
const installerName = `${pkg.build.productName}-Setup-${version}.exe`;
const installerSrc = path.join(repoRoot, "dist", installerName);

if (!fs.existsSync(installerSrc)) {
  console.error(
    `설치 파일을 찾을 수 없습니다: ${installerSrc}\n먼저 "npm run dist:win"으로 빌드했는지 확인하세요.`,
  );
  process.exit(1);
}

fs.mkdirSync(releasesDir, { recursive: true });
const installerDest = path.join(releasesDir, installerName);
fs.copyFileSync(installerSrc, installerDest);

const manifestPath = path.join(releasesDir, "latest.json");
fs.writeFileSync(
  manifestPath,
  JSON.stringify({ version, installer: installerName, notes }, null, 2),
);

console.log(`배포 완료: ${installerDest}`);
console.log(`매니페스트 갱신: ${manifestPath} (버전 ${version})`);
console.log("이제 각 PC가 프로그램을 켤 때마다 자동으로 업데이트 알림을 받습니다.");
