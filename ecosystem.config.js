// pm2 설정 파일. Windows PowerShell에서 `pm2 start ... -- start -p 4200`처럼
// CLI로 인자를 넘기면 일부 pm2 버전이 인자 구분을 잘못해서 그 인자 자체를
// 스크립트 이름으로 착각하는 문제가 있다("Script not found: .../start").
// 이 파일에 인자를 미리 적어두면 그 문제를 완전히 피할 수 있다.
module.exports = {
  apps: [
    {
      name: "workorder",
      script: "node_modules/next/dist/bin/next",
      args: ["start", "-p", "4200"],
      cwd: __dirname,
    },
  ],
};
