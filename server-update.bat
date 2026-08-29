@echo off
setlocal

rem 사람이 지켜보지 않아도 안전한 무인 업데이트 스크립트(Windows 작업
rem 스케줄러로 하루 2번 등 정기 실행하는 용도). server-start.bat과 달리
rem 아무것도 물어보지 않는다 - .env 최초 설정은 server-start.bat으로 미리
rem 한 번 끝내둔 상태여야 한다.
rem
rem git reset --hard로 원격 브랜치 상태에 강제로 맞춘다(로컬에만 있는
rem 변경사항은 버려짐) - 서버 PC에서는 누가 직접 파일을 고치는 일이 없어야
rem 하므로, 예전에 겪었던 "package-lock.json 로컬 변경 때문에 pull 실패"
rem 같은 상황이 무인 실행 중에 스크립트를 멈춰 세우지 않도록 하기 위함이다.

cd /d %~dp0
set LOGFILE=%~dp0update-log.txt

echo ==================================================== >> "%LOGFILE%"
echo %date% %time% - 업데이트 시작 >> "%LOGFILE%"

for /f "usebackq delims=" %%b in (`git rev-parse --abbrev-ref HEAD`) do set BRANCH=%%b

git fetch origin >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  echo %date% %time% - git fetch 실패 >> "%LOGFILE%"
  goto :end
)

git reset --hard origin/%BRANCH% >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  echo %date% %time% - git reset 실패 >> "%LOGFILE%"
  goto :end
)

call npm ci >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  echo %date% %time% - npm ci 실패 >> "%LOGFILE%"
  goto :end
)

call npm run build >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  echo %date% %time% - 빌드 실패 >> "%LOGFILE%"
  goto :end
)

call pm2 restart workorder >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  echo %date% %time% - pm2 restart 실패(서버가 아직 등록 안 됐다면 server-start.bat을 먼저 실행하세요) >> "%LOGFILE%"
  goto :end
)

echo %date% %time% - 업데이트 완료 (브랜치: %BRANCH%) >> "%LOGFILE%"

:end
endlocal
