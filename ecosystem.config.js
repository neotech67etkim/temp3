// pm2 설정 파일. Windows PowerShell에서 `pm2 start ... -- start -p 4200`처럼
// CLI로 인자를 넘기면 일부 pm2 버전이 인자 구분을 잘못해서 그 인자 자체를
// 스크립트 이름으로 착각하는 문제가 있다("Script not found: .../start").
// 이 파일에 인자를 미리 적어두면 그 문제를 완전히 피할 수 있다.
//
// 포트는 하드코딩하지 않고 .env의 PORT 값을 읽어온다 - 이 파일은 git으로
// 관리되는 공용 파일이라, 만약 포트를 여기 직접 적어두면 서버 PC마다 다른
// 포트가 필요할 때(예: 그 PC에서 이미 다른 프로그램이 4200을 쓰고 있는
// 경우) 이 파일을 직접 고쳐야 하는데, server-update.bat이 매번
// git reset --hard로 원본 상태로 되돌리면서 그 수정이 사라져버린다.
// .env는 git에 올라가지 않고 서버마다 따로 두는 파일이므로, 포트 설정은
// 거기서만 하면 된다.
const fs = require("node:fs");
const path = require("node:path");

function readPort() {
  try {
    const envContent = fs.readFileSync(path.join(__dirname, ".env"), "utf-8");
    const match = envContent.match(/^PORT\s*=\s*"?(\d+)"?/m);
    if (match) return match[1];
  } catch {
    // .env가 없으면 기본값으로 진행 (개발용 fallback)
  }
  return "4200";
}

module.exports = {
  apps: [
    {
      name: "workorder",
      script: "node_modules/next/dist/bin/next",
      args: ["start", "-p", readPort()],
      cwd: __dirname,
    },
  ],
};
