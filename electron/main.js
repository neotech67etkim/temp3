// Electron 메인 프로세스.
//
// 이 앱의 실제 화면/로직(로그인, 대시보드, 편집 세션 등)은 전부 기존 Next.js
// 앱(같은 저장소, src/ 아래)이 그대로 담당한다. Electron이 하는 일은 딱 두 가지뿐이다:
//   1) 이 PC에서 Next.js 프로덕션 서버를 로컬 포트로 띄운다(외부에 노출하지 않음).
//   2) 그 주소를 보여주는 네이티브 창을 연다.
// Next.js의 Server Action/Server Component는 그냥 Node.js 코드라서, NAS 공유
// 폴더 파일 읽기/쓰기(src/lib/nas-store.ts 등)가 이 프로세스 안에서 아무 문제
// 없이 동작한다 - 브라우저 샌드박스를 거치지 않기 때문이다.
//
// NAS 경로는 PC마다(심지어 같은 PC도 재부팅/재연결마다) 드라이브 문자가
// 달라질 수 있어서, 절대 경로(UNC/드라이브 문자)를 고정 저장하지 않는다.
// 대신 "드라이브 문자를 뗀 상대 경로"만 기억해두고, 실행할 때마다 그 상대
// 경로를 가진 드라이브를 자동으로 찾는다(electron/resolve-nas-path.js).

const { app, BrowserWindow, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { resolveNasRoot, stripDriveLetter } = require("./resolve-nas-path");

const PORT = 4200;
const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");
const WORKSPACE_ROOT = path.join(app.getPath("userData"), "workspace");

// 패키징된 앱에서는 Next.js 프로젝트 전체(node_modules, .next, public, prisma)를
// resources/app 아래에 그대로 복사해 넣는다(electron-builder extraResources 설정).
// 개발 중(electron .)에는 저장소 루트를 그대로 사용한다.
const APP_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, "app")
  : path.join(__dirname, "..");

let serverProcess = null;
let mainWindow = null;

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return null;
  }
}

function saveConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function showHtmlPrompt({ title, width, height, html }) {
  return new Promise((resolve) => {
    const promptWindow = new BrowserWindow({
      width,
      height,
      resizable: false,
      title,
      webPreferences: { contextIsolation: true },
    });

    const { ipcMain } = require("electron");
    const tmpHtmlPath = path.join(app.getPath("temp"), `prompt-${Date.now()}.html`);
    fs.writeFileSync(tmpHtmlPath, html);
    promptWindow.loadFile(tmpHtmlPath);

    ipcMain.once("prompt-submitted", (_event, value) => {
      promptWindow.close();
      resolve(value);
    });
  });
}

/**
 * 최초 실행 시(또는 지난번 경로를 더 이상 못 찾을 때) 지금 화면에 보이는
 * 경로를 그대로 입력받는다(예: V:\10. 외업도장과\AI 프로젝트\dev). 여기서
 * 드라이브 문자를 자동으로 떼어내고 상대 경로만 기억해둔다 - 다음번엔 어느
 * 드라이브 문자를 쓰든 그 상대 경로를 찾아서 자동으로 연결한다.
 */
async function promptForNasPath(previousError) {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { font-family: sans-serif; padding: 20px; font-size: 13px; color: #1e293b; }
  input { width: 100%; padding: 8px; box-sizing: border-box; margin-top: 6px; }
  button { margin-top: 14px; padding: 8px 16px; background: #2563eb; color: white;
           border: none; border-radius: 6px; cursor: pointer; }
  p.hint { color: #64748b; font-size: 12px; }
  p.error { color: #dc2626; font-size: 12px; }
</style></head>
<body>
  <h3>NAS 공유 폴더 경로를 입력하세요</h3>
  ${previousError ? `<p class="error">${previousError}</p>` : ""}
  <p class="hint">지금 파일 탐색기에서 보이는 경로를 그대로 입력하면 됩니다
  (예: V:\\10. 외업도장과\\AI 프로젝트\\dev). 드라이브 문자는 자동으로
  기억하지 않고, 다음 실행부터는 이 경로를 가진 드라이브를 매번 자동으로
  찾아서 연결합니다 - PC마다, 또는 재연결될 때마다 드라이브 문자가 달라져도
  괜찮습니다.</p>
  <input id="nasPath" placeholder="V:\\10. 외업도장과\\AI 프로젝트\\dev" />
  <button onclick="submit()">저장하고 시작</button>
  <script>
    function submit() {
      const value = document.getElementById('nasPath').value.trim();
      if (!value) return;
      require('electron').ipcRenderer.send('prompt-submitted', value);
    }
  </script>
</body></html>`;

  return showHtmlPrompt({ title: "초기 설정", width: 580, height: previousError ? 300 : 280, html });
}

/**
 * config에 저장된 상대 경로로 지금 이 PC에서 접근 가능한 드라이브를 찾는다.
 * 못 찾으면 사용자에게 다시 물어보고(경로가 바뀌었을 수도 있으니), 새로
 * 입력받은 값에서 상대 경로를 다시 추출해 저장한다.
 */
async function resolveOrPromptNasRoot() {
  let config = loadConfig();

  while (true) {
    if (!config?.relativePath) {
      const input = await promptForNasPath();
      const relativePath = stripDriveLetter(input);
      if (!relativePath) {
        // "V:\..." 형태가 아니면(UNC 등) 그대로 상대경로 없이 고정 경로로 취급.
        config = { fixedPath: input };
        saveConfig(config);
        return input;
      }
      config = { relativePath, lastKnownDrive: input.trim()[0].toUpperCase() };
      saveConfig(config);
    }

    if (config.fixedPath) {
      return config.fixedPath; // UNC처럼 드라이브 문자와 무관한 고정 경로
    }

    const resolved = resolveNasRoot(config.relativePath, config.lastKnownDrive);
    if (resolved) {
      if (resolved.drive !== config.lastKnownDrive) {
        config.lastKnownDrive = resolved.drive;
        saveConfig(config);
      }
      return resolved.fullPath;
    }

    // 못 찾음: 경로가 바뀌었거나 아직 NAS에 연결 안 됐을 수 있음. 다시 물어봄.
    const input = await promptForNasPath(
      `"${config.relativePath}" 경로를 어느 드라이브에서도 찾지 못했습니다. NAS 연결(EFAM)을 확인하고 경로를 다시 입력해주세요.`,
    );
    const relativePath = stripDriveLetter(input);
    config = relativePath
      ? { relativePath, lastKnownDrive: input.trim()[0].toUpperCase() }
      : { fixedPath: input };
    saveConfig(config);
  }
}

function waitForServer(port, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http
        .get(`http://localhost:${port}/login`, (res) => {
          res.resume();
          resolve();
        })
        .on("error", () => {
          if (Date.now() - start > timeoutMs) {
            reject(new Error("서버 시작 대기 시간 초과"));
            return;
          }
          setTimeout(check, 300);
        });
    };
    check();
  });
}

function startNextServer(env) {
  const nextBin = path.join(APP_ROOT, "node_modules", ".bin", "next");
  serverProcess = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], {
    cwd: APP_ROOT,
    env: { ...process.env, ...env },
    stdio: "pipe",
  });
  serverProcess.stdout.on("data", (d) => console.log(`[next] ${d}`));
  serverProcess.stderr.on("data", (d) => console.error(`[next] ${d}`));
  serverProcess.on("exit", (code) => {
    console.log(`Next 서버가 종료됨 (code ${code})`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "Work Order 관리",
    webPreferences: { contextIsolation: true },
  });
  mainWindow.loadURL(`http://localhost:${PORT}/login`);
}

app.whenReady().then(async () => {
  let nasRoot;
  try {
    nasRoot = await resolveOrPromptNasRoot();
  } catch (err) {
    dialog.showErrorBox("설정 실패", `NAS 경로를 확인하지 못했습니다.\n\n${err.message}`);
    app.quit();
    return;
  }

  fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });

  const env = {
    NODE_ENV: "production",
    NAS_ROOT: nasRoot,
    LOCAL_WORKSPACE_ROOT: WORKSPACE_ROOT,
    DATABASE_URL: `file:${path.join(nasRoot, "org.db")}`,
    PRISMA_MIGRATIONS_DIR: path.join(APP_ROOT, "prisma", "migrations"),
  };

  try {
    startNextServer(env);
    await waitForServer(PORT);
    createWindow();
  } catch (err) {
    dialog.showErrorBox(
      "시작 실패",
      `서버를 시작하지 못했습니다.\n\n${err.message}\n\nNAS 경로(${nasRoot})에 접근 가능한지 확인해주세요.`,
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
