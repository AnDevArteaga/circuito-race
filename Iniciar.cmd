@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Instala Node.js 22 LTS o superior desde https://nodejs.org/
  pause
  exit /b 1
)
node --input-type=module -e "if (Number(process.versions.node.split('.')[0]) < 22) process.exit(1)"
if errorlevel 1 (
  echo Este juego requiere Node.js 22 LTS o superior.
  pause
  exit /b 1
)
node server.mjs
pause
