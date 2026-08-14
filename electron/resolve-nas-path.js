// 드라이브 문자는 PC마다(심지어 같은 PC에서도 재부팅/재연결마다) 다르게
// 매핑될 수 있다. UNC 경로를 요구하는 대신, "공유 폴더 안의 상대 경로"만
// 기억해두고, 실행할 때마다 그 상대 경로를 가진 드라이브를 A~Z까지 훑어서
// 찾는다. 지난번에 찾았던 드라이브를 먼저 확인해서(빠른 경로), 거기 없으면
// 처음부터 다시 훑는다(드라이브 문자가 바뀐 경우 자동으로 복구).

const fs = require("node:fs");
const path = require("node:path");

const DRIVE_LETTERS = "CDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function driveRoot(letter, relativePath) {
  return path.join(`${letter}:\\`, relativePath);
}

function isAccessible(fullPath) {
  try {
    fs.accessSync(fullPath, fs.constants.R_OK | fs.constants.W_OK);
    return fs.statSync(fullPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * relativePath(예: "10. 외업도장과\\AI 프로젝트\\dev")를 가진 드라이브를 찾는다.
 * lastKnownDrive가 주어지면 그것부터 먼저 확인한다(대부분의 경우 그대로일
 * 것이므로 매번 A~Z를 다 훑지 않아도 됨).
 *
 * 반환: { fullPath, drive } 또는 못 찾으면 null.
 */
function resolveNasRoot(relativePath, lastKnownDrive) {
  if (lastKnownDrive) {
    const candidate = driveRoot(lastKnownDrive, relativePath);
    if (isAccessible(candidate)) {
      return { fullPath: candidate, drive: lastKnownDrive };
    }
  }

  for (const letter of DRIVE_LETTERS) {
    if (letter === lastKnownDrive) continue; // 이미 확인함
    const candidate = driveRoot(letter, relativePath);
    if (isAccessible(candidate)) {
      return { fullPath: candidate, drive: letter };
    }
  }

  return null;
}

/** "V:\10. 외업도장과\AI 프로젝트\dev" 같은 절대 경로에서 드라이브 문자를 뗀 상대 경로를 뽑아낸다. */
function stripDriveLetter(absolutePath) {
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(absolutePath.trim());
  if (!match) return null;
  return match[2];
}

module.exports = { resolveNasRoot, stripDriveLetter };
