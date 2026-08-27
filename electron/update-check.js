// NAS 기반의 아주 단순한 업데이트 확인/설치 도우미.
//
// 이 앱은 "상시 켜진 서버가 필요 없다"는 게 핵심 설계 결정이라(DEPLOYMENT.md),
// electron-updater 같은 HTTP 기반 자동 업데이트는 쓰지 않는다 - 그러면 배포용
// 웹서버를 새로 하나 세워야 하기 때문. 대신 이미 모든 PC가 접근 가능한 같은
// NAS 공유 폴더 안에 "releases/" 폴더를 두고, 거기 있는 설치 파일 버전과 지금
// 실행 중인 버전을 비교한다. 새 버전이 있으면 창을 하나 띄워서 물어보고,
// 사용자가 동의하면 그 설치 파일을 실행한 뒤 앱을 종료한다(설치 마법사가
// 이어받는다).
//
// releases/latest.json 형식:
//   { "version": "1.1.0", "installer": "WorkOrder-Setup-1.1.0.exe", "notes": "..." }
// "installer"는 같은 releases 폴더 안에 있는 파일 이름이어야 한다.

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function releasesDir(nasRoot) {
  return path.join(nasRoot, "releases");
}

/** "1.2.10" 같은 x.y.z 버전 문자열을 비교한다. a가 b보다 최신이면 양수. */
function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * NAS의 releases/latest.json을 읽어 지금 버전보다 최신이고, 설치 파일이
 * 실제로 그 자리에 있으면 그 정보를 돌려준다. 무엇 하나라도 어긋나면(파일이
 * 없거나, 형식이 깨졌거나, NAS 연결이 잠시 끊겼거나) 그냥 "업데이트 없음"으로
 * 취급한다 - 업데이트 확인 실패가 앱 사용 자체를 막으면 안 되기 때문.
 */
function findAvailableUpdate(nasRoot, currentVersion) {
  try {
    const manifestPath = path.join(releasesDir(nasRoot), "latest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    if (!manifest?.version || !manifest?.installer) return null;
    if (compareVersions(manifest.version, currentVersion) <= 0) return null;

    const installerPath = path.join(releasesDir(nasRoot), manifest.installer);
    if (!fs.existsSync(installerPath)) return null;

    return { version: manifest.version, installerPath, notes: manifest.notes ?? "" };
  } catch {
    return null;
  }
}

/**
 * 설치 파일을 실행하고(설치 마법사가 이어받도록) 이 앱은 종료한다.
 * spawn 자체는 거의 즉시 반환되지만, 실제 설치 마법사 창이 화면에 뜨기까지는
 * (특히 NAS 경로에서 실행할 때) 약간의 시간차가 있다. 그 사이에 바로
 * app.quit()을 불러버리면 이 앱 창은 사라지고 설치 마법사 창은 아직 안 뜬
 * 상태라 "멈춘 것처럼" 보인다 - onQuitting 콜백으로 그 사이를 채울 안내
 * 창을 띄우게 하고, 짧게 대기한 뒤 종료한다.
 */
function launchInstallerAndQuit(app, installerPath, onQuitting) {
  const child = spawn(installerPath, [], { detached: true, stdio: "ignore" });
  child.unref();
  if (onQuitting) onQuitting();
  setTimeout(() => app.quit(), 1200);
}

module.exports = { findAvailableUpdate, launchInstallerAndQuit, compareVersions };
