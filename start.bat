@echo off
echo ==========================================
echo Proxmox VM Dashboard - One-Click Setup
echo ==========================================

echo.
echo [1/4] Installing root dependencies...
if not exist "node_modules" (
    call npm install
) else (
    echo INFO: Root dependencies already installed
)

echo.
echo [2/4] Installing server dependencies...
cd server
if not exist "node_modules" (
    call npm install
) else (
    echo INFO: Server dependencies already installed
)
cd ..

echo.
echo [3/4] Installing client dependencies...
cd client
if not exist "node_modules" (
    call npm install
) else (
    echo INFO: Client dependencies already installed
)
cd ..

echo.
echo [4/4] Setting up configuration...
if not exist "server\.env" (
    echo Creating environment file...
    copy "server\env.example" "server\.env"
    echo Environment file created
) else (
    echo INFO: Environment file already exists
)

echo.
echo Setting up database...
cd server
call npm run setup-db
echo.
echo Updating VM assignments...
node scripts\update-vm-assignments.js
cd ..

echo.
echo ==========================================
echo Setup Complete! Starting Dashboard...
echo ==========================================

echo.
echo Starting development servers...
echo - Backend API: http://localhost:5000
echo - Frontend UI: http://localhost:3000
echo.
echo WARNING: Keep this window open while using the application
echo WARNING: Press Ctrl+C to stop all servers
echo.

echo Starting servers in 3 seconds...
timeout /t 3 /nobreak >nul

start "Proxmox API Server" cmd /k "cd server && npm run dev"
timeout /t 2 /nobreak >nul
start "React Client" cmd /k "cd client && npm start"

echo.
echo ===============================
echo Dashboard is starting up...
echo ===============================
echo.
echo The React application will open automatically in your browser.
echo If it doesn't open, visit: http://localhost:3000
echo.
echo Demo Credentials:
echo - Customer: customer1 / password123
echo - Admin: admin / admin123
echo.
echo Press any key to close this window...
pause >nul 