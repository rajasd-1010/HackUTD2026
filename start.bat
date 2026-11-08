@echo off
title The Devil Wears Down Payments
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this again.
  pause
  exit /b
)
for /f "tokens=1 delims=v." %%a in ('node -v') do set NODEMAJOR=%%a
if %NODEMAJOR% LSS 22 (
  echo You have Node %NODEMAJOR%. Please install Node 22 or newer from https://nodejs.org and run this again.
  pause
  exit /b
)

echo Checking packages...
call npm install --no-audit --no-fund
if not exist server\key.env copy server\key.env.example server\key.env >nul

echo.
echo The Devil Wears Down Payments is starting. Your browser opens in a few seconds.
echo Keep this window open. Close it to stop the app.
echo.
start "" cmd /c "timeout /t 30 >nul & start http://localhost:5173"
call npm run go
pause
