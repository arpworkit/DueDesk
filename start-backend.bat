@echo off
title DueDesk Backend Server
echo.
echo ========================================
echo    🚀 Starting DueDesk Backend Server
echo ========================================
echo.
echo Server will run on: http://localhost:4000
echo.
cd /d "E:\GenAI\Userstory\duedesk-backend"
echo Installing dependencies...
call npm install
echo.
echo Starting server...
echo.
call node index.js
pause
