@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

rem 상시 웹서버로 이 앱을 세팅/실행/업데이트하는 스크립트.
rem 최초 실행이든, 코드 업데이트 후 재실행이든 이 스크립트 하나로 처리됩니다.
rem 사용법: 그냥 server-start.bat 더블클릭 (또는 터미널에서 server-start.bat)

echo ================================================
echo  1/5  git pull (최신 코드 받기)
echo ================================================
git pull
if errorlevel 1 goto :error

echo.
echo ================================================
echo  2/5  npm ci (의존성 설치)
echo ================================================
call npm ci
if errorlevel 1 goto :error

echo.
echo ================================================
echo  3/5  .env 확인
echo ================================================
if not exist .env (
  echo .env 파일이 없어 최초 설정을 진행합니다.
  echo.
  echo 이 PC의 사내 IP 주소 목록:
  ipconfig | findstr /i "IPv4"
  echo.
  echo [주의] V:\ 같은 네트워크 공유 드라이브 - NAS, UNC 경로 - 는 안 됩니다.
  echo SQLite가 네트워크 드라이브 위에서는 잠금이 불안정해 오류가 납니다.
  echo 반드시 이 PC의 로컬 디스크 경로를 입력하세요. 예: C:\workorder-data
  echo 기존에 NAS 폴더에 있던 데이터가 있다면, 먼저 그 폴더를 로컬 디스크로
  echo 복사해 넣고 그 로컬 경로를 입력하세요.
  echo 예: robocopy "V:\기존 경로" "C:\workorder-data" /E
  echo.
  set /p DATA_DIR_INPUT="데이터를 저장할 로컬 폴더 경로를 입력하세요: "
  if "!DATA_DIR_INPUT!"=="" set DATA_DIR_INPUT=.\.dev-data
  if not exist "!DATA_DIR_INPUT!" mkdir "!DATA_DIR_INPUT!"

  echo.
  echo 다른 PC에서 접속할 주소 예시: http://192.168.0.10:4200
  echo 이 PC에서만 쓸 거면 그냥 Enter만 누르세요.
  set /p NEXTAUTH_URL_INPUT="접속 주소를 입력하세요: "
  if "!NEXTAUTH_URL_INPUT!"=="" set NEXTAUTH_URL_INPUT=http://localhost:4200

  for /f "usebackq delims=" %%s in (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`) do set SECRET=%%s

  (
    echo DATA_DIR="!DATA_DIR_INPUT!"
    echo NEXTAUTH_SECRET="!SECRET!"
    echo NEXTAUTH_URL="!NEXTAUTH_URL_INPUT!"
    echo PORT=4200
  ) > .env

  echo .env 파일을 생성했습니다: !DATA_DIR_INPUT!
  echo 기존 NAS 폴더에 org.db/과별 .db 파일이 있다면, 지금 그 파일들을
  echo !DATA_DIR_INPUT! 폴더로 복사해 넣으면 데이터가 그대로 이어집니다.
  echo 잘못 입력했다면 .env 파일을 메모장으로 열어 직접 고치세요.
  pause
) else (
  echo .env 파일이 이미 있습니다. 건너뜁니다.
)

echo.
echo ================================================
echo  4/5  빌드 (npm run build)
echo ================================================
call npm run build
if errorlevel 1 goto :error

echo.
echo ================================================
echo  5/5  서버 실행 (pm2로 상시 실행 등록)
echo ================================================
where pm2 >nul 2>nul
if errorlevel 1 (
  echo pm2가 설치되어 있지 않아 설치합니다...
  call npm install -g pm2
  if errorlevel 1 goto :error
)

call pm2 describe workorder >nul 2>nul
if errorlevel 1 (
  rem CLI로 인자를 넘기면 일부 pm2 버전이 Windows에서 그 인자 자체를
  rem 스크립트 이름으로 잘못 해석하는 pm2 자체 버그가 있어, 인자를 미리
  rem 적어둔 ecosystem.config.js로 실행해 우회한다.
  call pm2 start ecosystem.config.js
) else (
  call pm2 restart workorder
)
call pm2 save

echo.
echo ================================================
echo  완료되었습니다.
echo  브라우저로 .env의 NEXTAUTH_URL 주소(또는 http://localhost:4200)에
echo  접속하세요.
echo.
echo  [중요] 이 PC가 재부팅돼도 서버가 자동으로 다시 켜지게 하려면,
echo  Windows 작업 스케줄러에 "로그온 시 pm2 resurrect 실행" 작업을
echo  한 번만 등록해야 합니다(자세한 방법은 DEPLOYMENT.md 참고). 이건
echo  이 스크립트가 대신 해주지 않으므로 꼭 한 번 확인하세요.
echo ================================================
goto :end

:error
echo.
echo ================================================
echo  오류가 발생했습니다. 위 로그를 확인하세요.
echo ================================================
exit /b 1

:end
endlocal
