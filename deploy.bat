@echo off
setlocal

rem 사용법: deploy.bat "이번에 바뀐 내용 한 줄 설명"
rem git pull -> npm ci -> 버전 올리기 -> 빌드 -> NAS releases에 배포까지 한 번에.
rem 배포까지 끝나면, 이미 설치되어 있는 각 PC는 다음 실행 시 자동으로
rem 새 버전을 감지해서 업데이트를 물어봅니다(재설치 파일을 따로 돌릴 필요 없음).

set BRANCH=claude/work-order-task-project-3lfd51
set NOTES=%*
if "%NOTES%"=="" set NOTES=버그 수정 및 개선

echo ================================================
echo  1/6  git pull (%BRANCH%)
echo ================================================
git pull --no-edit origin %BRANCH%
if errorlevel 1 goto :error

echo.
echo ================================================
echo  2/6  npm ci
echo ================================================
call npm ci
if errorlevel 1 goto :error

echo.
echo ================================================
echo  3/6  버전 올리기 (patch)
echo ================================================
call npm version patch --no-git-tag-version
if errorlevel 1 goto :error

for /f "usebackq delims=" %%v in (`node -p "require('./package.json').version"`) do set NEW_VERSION=%%v
echo 새 버전: %NEW_VERSION%

git add package.json
git commit -m "chore: bump version to %NEW_VERSION%"
if errorlevel 1 goto :error
git push origin %BRANCH%
if errorlevel 1 goto :error

echo.
echo ================================================
echo  4/6  빌드 (npm run dist:win)
echo ================================================
call npm run dist:win
if errorlevel 1 goto :error

echo.
echo ================================================
echo  5/6  NAS 경로 확인
echo ================================================
for /f "usebackq delims=" %%p in (`node scripts\resolve-nas-root.js`) do set NAS_ROOT=%%p
if "%NAS_ROOT%"=="" (
  echo NAS 경로를 찾지 못했습니다. WorkOrder 프로그램을 이 PC에서 한 번이라도 실행했는지 확인하세요.
  goto :error
)
echo NAS 경로: %NAS_ROOT%

echo.
echo ================================================
echo  6/6  NAS releases 폴더로 배포
echo ================================================
call npm run publish:win -- "%NAS_ROOT%\releases" %NOTES%
if errorlevel 1 goto :error

echo.
echo ================================================
echo  배포 완료: 버전 %NEW_VERSION%
echo  이미 설치된 각 PC는 다음 실행 시 자동으로 업데이트를 안내받습니다.
echo ================================================
goto :end

:error
echo.
echo ================================================
echo  배포 중 오류가 발생했습니다. 위 로그를 확인하세요.
echo ================================================
exit /b 1

:end
endlocal
