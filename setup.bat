@echo off
echo ==========================================
echo Proxmox VM Dashboard - Setup
echo ==========================================

echo.
echo Installing dependencies...
cd server
call npm install
cd ..

echo.
echo Creating environment file...
if not exist "server\.env" (
    copy "server\env.example" "server\.env"
    echo Environment file created
) else (
    echo INFO: Environment file already exists
)

echo.
echo Setting up database...
cd server
call npm run setup-db
cd ..

echo.
echo Updating VM assignments to match your Proxmox server...
cd server
node scripts\update-vm-assignments.js
cd ..

echo.
echo ==========================================
echo Setup Complete!
echo ==========================================
echo.
echo Your Proxmox dashboard is ready to use!
echo.
echo Credentials:
echo   customer1 / password123
echo   customer2 / password123  
echo   admin / admin123
echo.
echo To start: run start.bat
echo.
pause 