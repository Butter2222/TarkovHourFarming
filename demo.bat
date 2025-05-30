@echo off
echo ========================================
echo Proxmox VM Dashboard - Quick Demo Setup
echo ========================================

echo.
echo This script will:
echo 1. Install all dependencies
echo 2. Set up the environment
echo 3. Start the application
echo.
set /p continue="Continue with demo setup? (y/n): "
if /i not "%continue%"=="y" (
    echo Demo setup cancelled.
    pause
    exit /b 0
)

echo.
echo ========================================
echo Step 1: Installing Dependencies
echo ========================================
call install.bat

echo.
echo ========================================
echo Step 2: Setting Up Environment
echo ========================================
call setup.bat

echo.
echo ========================================
echo Step 3: Starting Application
echo ========================================
call start.bat

echo.
echo Demo setup complete!
pause 