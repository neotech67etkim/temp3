// Electron 메인 프로세스.
//
// 이 앱의 실제 화면/로직(로그인, 대시보드, 편집 세션 등)은 전부 기존 Next.js
// 앱(같은 저장소, src/ 아래)이 그대로 담당한다. Electron이 하는 일은 딱 두 가지뿐이다:
//   1) 이 PC에서 Next.js 프로덕션 서버를 로컬 포트로 띄운다(외부에 노출하지 않음).
//   2) 그 주소를 보여주는 네이티브 창을 연다.
// Next.js의 Server Action/Server Component는 그냥 Node.js 코드라서, NAS 공유
// 폴더 파일 읽기/쓰기(src/lib/nas-store.ts 등)가 이 프로세스 안에서 아무 문제
// 없이 동작한다 - 브라우저 샌드박스를 거치지 않기 때문이다.

const { app, BrowserWindow, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const { spawn } = require("node:child_process");

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

/**
 * 최초 실행 시 NAS 공유 폴더 경로를 한 번만 물어본다. 이후에는 config.json에
 * 저장된 값을 그대로 쓴다. (예: \\사내서버\해양시스템공사부\WorkOrderApp)
 */
async function promptForNasRoot() {
  return new Promise((resolve) => {
    const promptWindow = new BrowserWindow({
      width: 560,
      height: 260,
      resizable: false,
      title: "초기 설정",
      webPreferences: { contextIsolation: true },
    });

    const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { font-family: sans-serif; padding: 20px; font-size: 13px; color: #1e293b; }
  input { width: 100%; padding: 8px; box-sizing: border-box; margin-top: 6px; }
  button { margin-top: 14px; padding: 8px 16px; background: #2563eb; color: white;
           border: none; border-radius: 6px; cursor: pointer; }
  p.hint { color: #64748b; font-size: 12px; }
</style></head>
<body>
  <h3>NAS 공유 폴더 경로를 입력하세요</h3>
  <p class="hint">예: \\\\사내서버\\해양시스템공사부\\WorkOrderApp<br/>
  드라이브 문자(V:\\ 등)가 아니라 UNC 경로를 입력하면, PC마다 드라이브
  문자가 달라도 항상 같은 위치를 가리킵니다.</p>
  <input id="nasRoot" placeholder="\\\\서버이름\\공유폴더\\WorkOrderApp" />
  <button onclick="submit()">저장하고 시작</button>
  <script>
    function submit() {
      const value = document.getElementById('nasRoot').value.trim();
      if (!value) return;
      require('electron').ipcRenderer.send('nas-root-submitted', value);
    }
  </script>
</body></html>`;

    const { ipcMain } = require("electron");
    const tmpHtmlPath = path.join(app.getPath("temp"), "setup-prompt.html");
    fs.writeFileSync(tmpHtmlPath, html);
    promptWindow.loadFile(tmpHtmlPath);

    ipcMain.once("nas-root-submitted", (_event, value) => {
      promptWindow.close();
      resolve(value);
    });
  });
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
  let config = loadConfig();
  if (!config?.nasRoot) {
    const nasRoot = await promptForNasRoot();
    config = { nasRoot };
    saveConfig(config);
  }

  fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });

  const env = {
    NODE_ENV: "production",
    NAS_ROOT: config.nasRoot,
    LOCAL_WORKSPACE_ROOT: WORKSPACE_ROOT,
    DATABASE_URL: `file:${path.join(config.nasRoot, "org.db")}`,
    PRISMA_MIGRATIONS_DIR: path.join(APP_ROOT, "prisma", "migrations"),
  };

  try {
    startNextServer(env);
    await waitForServer(PORT);
    createWindow();
  } catch (err) {
    dialog.showErrorBox(
      "시작 실패",
      `서버를 시작하지 못했습니다.\n\n${err.message}\n\nNAS 경로(${config.nasRoot})에 접근 가능한지 확인해주세요.`,
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
