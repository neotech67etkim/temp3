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

const { app, BrowserWindow, dialog, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { resolveNasRoot, stripDriveLetter } = require("./resolve-nas-path");
const { findAvailableUpdate, launchInstallerAndQuit } = require("./update-check");

// 이 앱은 해양시스템공사부 전용이라 NAS 위치가 사실상 고정이다. 최초
// 실행 때마다 사람이 경로를 직접 타이핑하게 하는 대신, 이 기본 경로를
// 먼저 자동으로 찾아본다(드라이브 문자 A~Z를 훑는 기존 로직 그대로 재사용).
// 찾으면 물어보지 않고 바로 시작하고, 못 찾을 때만(다른 부서에 배포하거나
// NAS 구조가 바뀐 경우) 예전처럼 직접 입력받는 창을 띄운다.
const DEFAULT_NAS_RELATIVE_PATH = "10. 외업도장과\\AI 프로젝트\\dev";

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
 * NextAuth(next-auth v5)는 JWT 서명/암호화에 쓸 AUTH_SECRET이 반드시 있어야
 * 한다. .env는 Git에 올리지 않으므로(레포에 실제 비밀값을 두지 않기 위해)
 * 배포된 앱에는 애초에 없다 - 그래서 이 앱 전용으로 최초 실행 시 한 번만
 * 무작위 값을 생성해서 config.json에 저장해두고, 이후에는 매번 그 값을
 * 재사용한다(재실행마다 값이 바뀌면 기존 로그인 세션/쿠키가 전부 무효화됨).
 */
function ensureAuthSecret() {
  const config = loadConfig() || {};
  if (config.authSecret) return config.authSecret;
  const authSecret = crypto.randomBytes(32).toString("base64");
  saveConfig({ ...config, authSecret });
  return authSecret;
}

function showHtmlPrompt({ title, width, height, html }) {
  return new Promise((resolve) => {
    const promptWindow = new BrowserWindow({
      width,
      height,
      resizable: false,
      title,
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        // contextIsolation이 켜져 있으면 페이지 JS는 require()를 쓸 수 없다.
        // preload가 안전하게 window.promptAPI.submit()만 노출해준다.
        preload: path.join(__dirname, "preload-prompt.js"),
      },
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
  <button id="submitBtn">저장하고 시작</button>
  <script>
    function submit() {
      const value = document.getElementById('nasPath').value.trim();
      if (!value) return;
      window.promptAPI.submit(value);
    }
    document.getElementById('submitBtn').addEventListener('click', submit);
    document.getElementById('nasPath').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
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

  // 최초 실행(설정 파일 자체가 없음)이면, 사람에게 묻기 전에 기본 경로부터
  // 조용히 찾아본다. 찾아지면 사람이 아무것도 입력할 필요가 없다.
  if (!config) {
    const found = resolveNasRoot(DEFAULT_NAS_RELATIVE_PATH, undefined);
    if (found) {
      config = {
        relativePath: DEFAULT_NAS_RELATIVE_PATH,
        lastKnownDrive: found.drive,
      };
      saveConfig(config);
      return found.fullPath;
    }
  }

  while (true) {
    if (!config?.relativePath) {
      const input = await promptForNasPath();
      const relativePath = stripDriveLetter(input);
      if (!relativePath) {
        // "V:\..." 형태가 아니면(UNC 등) 그대로 상대경로 없이 고정 경로로 취급.
        config = { ...config, fixedPath: input };
        saveConfig(config);
        return input;
      }
      config = { ...config, relativePath, lastKnownDrive: input.trim()[0].toUpperCase() };
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
      ? { ...config, relativePath, lastKnownDrive: input.trim()[0].toUpperCase() }
      : { ...config, fixedPath: input };
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

const LOG_PATH = path.join(app.getPath("userData"), "logs", "next-server.log");

function appendLog(line) {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    // 로그 남기기 자체가 실패해도 앱 동작에는 영향 주지 않는다.
  }
}

function startNextServer(env) {
  // node_modules/.bin/next는 npm이 만드는 셸 셔림(shim)이라 OS/npm 버전에
  // 따라 확장자 없는 파일이 아예 없을 수 있다(Windows는 .cmd/.ps1만 만드는
  // 경우가 흔함). 그 셔림을 거치지 않고, next 패키지의 실제 진입 스크립트를
  // 직접 node로 실행하면 플랫폼과 무관하게 항상 동작한다.
  const nextCli = path.join(APP_ROOT, "node_modules", "next", "dist", "bin", "next");
  serverProcess = spawn(process.execPath, [nextCli, "start", "-p", String(PORT)], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      ...env,
      // 패키징된 앱에서 process.execPath는 별도로 설치된 Node가 아니라
      // 이 Electron 실행 파일 자체를 가리킨다. 이 플래그 없이 그대로
      // spawn하면 Electron이 nextCli 인자를 "실행할 앱"으로 오인해서
      // 새 Electron 인스턴스를 띄우려 시도하고, 정작 Next 서버는 절대
      // 뜨지 않아 waitForServer가 매번 타임아웃난다("서버 시작 대기 시간
      // 초과" 증상과 정확히 일치) - 반드시 필요.
      ELECTRON_RUN_AS_NODE: "1",
    },
    stdio: "pipe",
  });
  // 중요: child_process의 "error" 이벤트를 처리하는 리스너가 하나도 없으면,
  // Node는 이걸 처리되지 않은 예외로 취급해서 Electron 메인 프로세스 전체를
  // 그 자리에서 죽여버린다(창도, 에러 대화상자도 없이 그냥 꺼짐) - 실제로
  // 겪은 증상과 일치. 반드시 리스너를 달아서 이 크래시를 막아야 한다.
  serverProcess.on("error", (err) => {
    appendLog(`서버 프로세스를 시작하지 못함: ${err.message}`);
  });
  // 패키징된 앱은 콘솔 창이 없어서 console.log/error가 어디에도 보이지
  // 않는다 - 문제가 생겼을 때 재현/디버깅이 불가능해지므로, 별도 코드
  // 수정 없이도 확인할 수 있도록 파일로 남긴다(%APPDATA%/<앱>/logs/next-server.log).
  serverProcess.stdout.on("data", (d) => appendLog(`[next stdout] ${d}`.trimEnd()));
  serverProcess.stderr.on("data", (d) => appendLog(`[next stderr] ${d}`.trimEnd()));
  serverProcess.on("exit", (code, signal) => {
    appendLog(`Next 서버가 종료됨 (code ${code}, signal ${signal})`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: `Work Order 관리 v${app.getVersion()}`,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true },
  });
  // 네이티브 메뉴를 완전히 없앴더니(Menu.setApplicationMenu(null)) 메뉴에
  // 딸려오던 "개발자 도구 열기" 단축키(F12/Ctrl+Shift+I)도 같이 사라졌다.
  // 화면에서 뭔가 안 눌리는 등 문제가 생겼을 때 원인(브라우저 콘솔 에러)을
  // 확인할 방법이 없으면 원격으로 디버깅이 사실상 불가능하므로, 단축키를
  // 직접 다시 연결해둔다.
  mainWindow.webContents.on("before-input-event", (_event, input) => {
    const isF12 = input.key === "F12";
    const isCtrlShiftI =
      input.control && input.shift && input.key.toLowerCase() === "i";
    if (isF12 || isCtrlShiftI) {
      mainWindow.webContents.toggleDevTools();
    }
  });
  mainWindow.loadURL(`http://localhost:${PORT}/login`);
}

/**
 * 설치 마법사가 실제로 뜨기 전까지의 공백 구간을 채우는 작은 안내 창.
 * 이 창이 없으면 메인 창은 사라지고 설치 마법사는 아직 안 뜬 사이에
 * Windows가 "(응답없음)"으로 표시해서 멈춘 것처럼 보인다.
 */
function showUpdatingOverlay() {
  const overlay = new BrowserWindow({
    width: 360,
    height: 150,
    resizable: false,
    minimizable: false,
    maximizable: false,
    frame: false,
    alwaysOnTop: true,
    center: true,
    webPreferences: { contextIsolation: true },
  });
  overlay.loadURL(
    "data:text/html;charset=utf-8," +
      encodeURIComponent(`<!doctype html>
<html><body style="margin:0;display:flex;flex-direction:column;align-items:center;
justify-content:center;height:100vh;background:#1e293b;color:#e2e8f0;
font-family:'Malgun Gothic',sans-serif;">
  <div style="width:28px;height:28px;border:3px solid #475569;
  border-top-color:#60a5fa;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
  <p style="margin-top:14px;font-size:13px;">업데이트 설치 파일을 실행하는 중입니다...</p>
  <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
</body></html>`),
  );
  return overlay;
}

/**
 * NAS의 releases/latest.json에 지금 버전보다 새 것이 있으면 물어보고,
 * 동의하면 설치 파일을 실행한 뒤 앱을 종료한다. 창이 뜬 뒤 백그라운드로
 * 확인하며, 실패하거나 새 버전이 없으면 조용히 넘어간다(사용을 막지 않음).
 */
function checkForUpdate(nasRoot) {
  const update = findAvailableUpdate(nasRoot, app.getVersion());
  if (!update) return;

  dialog
    .showMessageBox(mainWindow, {
      type: "info",
      buttons: ["지금 업데이트", "나중에"],
      defaultId: 0,
      cancelId: 1,
      title: "새 버전이 있습니다",
      message: `버전 ${update.version}로 업데이트할 수 있습니다.`,
      detail: update.notes || "지금 업데이트하면 설치 파일이 실행되고 이 프로그램은 종료됩니다.",
    })
    .then(({ response }) => {
      if (response !== 0) return;
      launchInstallerAndQuit(app, update.installerPath, showUpdatingOverlay);
    });
}

app.whenReady().then(async () => {
  // File/Edit/View/Window 메뉴바 자체를 없앤다(Alt 키로도 안 뜸). 이 앱은
  // Next.js 화면이 UI 전부를 담당하고, 네이티브 메뉴는 쓸 일이 없다.
  Menu.setApplicationMenu(null);

  let nasRoot;
  try {
    nasRoot = await resolveOrPromptNasRoot();
  } catch (err) {
    dialog.showErrorBox("설정 실패", `NAS 경로를 확인하지 못했습니다.\n\n${err.message}`);
    app.quit();
    return;
  }

  fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });

  const authSecret = ensureAuthSecret();

  const env = {
    NODE_ENV: "production",
    NAS_ROOT: nasRoot,
    LOCAL_WORKSPACE_ROOT: WORKSPACE_ROOT,
    DATABASE_URL: `file:${path.join(nasRoot, "org.db")}`,
    PRISMA_MIGRATIONS_DIR: path.join(APP_ROOT, "prisma", "migrations"),
    AUTH_SECRET: authSecret,
    AUTH_TRUST_HOST: "true",
  };

  try {
    startNextServer(env);
    await waitForServer(PORT);
    createWindow();
    checkForUpdate(nasRoot);
  } catch (err) {
    dialog.showErrorBox(
      "시작 실패",
      `서버를 시작하지 못했습니다.\n\n${err.message}\n\nNAS 경로(${nasRoot})에 접근 가능한지 확인해주세요.\n\n자세한 원인은 로그 파일을 확인하세요:\n${LOG_PATH}`,
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
