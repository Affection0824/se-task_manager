@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22.12+ or 24+ first.
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  call npm.cmd ci --no-fund
  if errorlevel 1 (
    echo Dependency installation failed. Check your network and retry.
    pause
    exit /b 1
  )
)
call npm.cmd run dev -- --open
if errorlevel 1 (
  echo Startup failed. Check the message above and close any existing server on port 5173.
  pause
)
endlocal
