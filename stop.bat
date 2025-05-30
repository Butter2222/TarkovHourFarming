@echo off
echo ===============================
echo Stopping Proxmox VM Dashboard
echo ===============================

echo.
echo Stopping all Node.js processes...

taskkill /f /im node.exe 2>nul
if %errorlevel% == 0 (
    echo ✅ Successfully stopped all Node.js processes
) else (
    echo ℹ️  No Node.js processes were running
)

echo.
echo Stopping any remaining npm processes...
taskkill /f /im npm.cmd 2>nul

echo.
echo ===============================
echo Cleanup Complete!
echo ===============================
echo.
echo All dashboard processes have been stopped.
echo You can now safely close any remaining terminal windows.
echo.
pause 