@echo off
title Skillz Windows Launcher

echo Checking Node.js installation...
node -v >nul 2>&1
if %errorlevel% neq 0 (
  echo Error: Node.js is not installed! Please install it from https://nodejs.org/
  pause
  exit /b 1
)

echo Checking dependencies...
if not exist "node_modules\" (
  echo Installing dependencies, this may take a moment...
  call npm install
)

echo Building frontend assets...
if not exist "dist\" (
  echo Building frontend...
  call npm run build
)

echo Starting Skills Windows Server...
start "" http://127.0.0.1:4188
node server.js
