@echo off
title DueDesk SMTP Setup
echo.
echo ========================================
echo    📧 DueDesk SMTP Configuration
echo ========================================
echo.
cd /d "E:\GenAI\Userstory\duedesk-backend"

if exist ".env" (
  echo SMTP configuration already exists in .env file.
  echo To reconfigure, delete the .env file and run this script again.
  pause
  exit /b
)

echo Setting up SMTP configuration...
echo.
echo This will create a .env file with your SMTP settings.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-smtp.ps1"

if exist ".env" (
  echo.
  echo ✓ SMTP configuration saved to .env file
  echo You can now start the backend server.
) else (
  echo.
  echo ✗ Failed to create SMTP configuration
)

pause
