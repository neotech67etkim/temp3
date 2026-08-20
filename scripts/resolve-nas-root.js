#!/usr/bin/env node
// 이 PC에 설치된 WorkOrder 앱이 실제로 쓰고 있는 NAS 경로를 알아내서
// stdout에 한 줄로 찍는다. deploy.bat이 이 값을 읽어서 releases 폴더
// 위치를 자동으로 정한다 - 드라이브 문자(V:\ 등)를 배포 스크립트에
// 하드코딩해두면 나중에 드라이브 문자가 바뀔 때마다 스크립트도 고쳐야
// 하므로, 앱과 똑같은 방식(electron/resolve-nas-path.js)으로 매번
// 다시 찾는다.

const fs = require("node:fs");
const path = require("node:path");
const { resolveNasRoot } = require("../electron/resolve-nas-path");

const configPath = path.join(process.env.APPDATA ?? "", "WorkOrder", "config.json");

function fail(message) {
  console.error(message);
  process.exit(1);
}

let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
} catch {
  fail(
    `설정 파일을 찾을 수 없습니다: ${configPath}\nWorkOrder 프로그램을 이 PC에서 한 번이라도 실행해서 NAS 경로를 입력한 적이 있는지 확인하세요.`,
  );
}

if (config.fixedPath) {
  console.log(config.fixedPath);
  process.exit(0);
}

if (!config.relativePath) {
  fail(`설정 파일에 NAS 경로 정보가 없습니다: ${configPath}`);
}

const resolved = resolveNasRoot(config.relativePath, config.lastKnownDrive);
if (!resolved) {
  fail(
    `"${config.relativePath}" 경로를 어느 드라이브에서도 찾지 못했습니다. NAS 연결을 확인하세요.`,
  );
}

console.log(resolved.fullPath);
