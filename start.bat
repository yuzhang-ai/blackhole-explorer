@echo off
setlocal
cd /d "%~dp0"
set PORT=41731

echo Black hole local viewer
echo Hero view: http://127.0.0.1:%PORT%/?fps=1
echo Leave this window open. Closing it stops the server.
echo.

where py >nul 2>&1
if %errorlevel%==0 (
  start "" cmd /c "timeout /t 1 /nobreak >nul & start http://127.0.0.1:%PORT%/?fps=1"
  py -m http.server %PORT% --bind 127.0.0.1
  goto :eof
)

where python >nul 2>&1
if %errorlevel%==0 (
  start "" cmd /c "timeout /t 1 /nobreak >nul & start http://127.0.0.1:%PORT%/?fps=1"
  python -m http.server %PORT% --bind 127.0.0.1
  goto :eof
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Port %PORT%
if errorlevel 1 pause
