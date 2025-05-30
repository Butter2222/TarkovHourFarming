@echo off
echo ===============================
echo Starting Proxmox VM Dashboard
echo ===============================

echo.
echo Checking if .env file exists...
if not exist "server\.env" (
    echo ERROR: server\.env file not found!
    echo Run setup.bat first to configure the environment.
    echo.
    pause
    exit /b 1
)

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