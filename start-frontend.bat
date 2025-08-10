@echo off
title DueDesk Frontend Dashboard
echo.
echo =========================================
echo    🎨 Starting DueDesk Frontend Dashboard
echo =========================================
echo.
echo Dashboard will run on: http://localhost:3000
echo.
cd /d "E:\GenAI\Userstory\duedesk-dashboard"
echo Installing dependencies...
call npm install
echo.
echo Starting development server...
echo.
call npm start
pause
