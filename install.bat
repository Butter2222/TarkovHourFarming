@echo off
echo ================================
echo Installing Proxmox VM Dashboard
echo ================================

echo.
echo Installing root dependencies...
call npm install

echo.
echo Installing server dependencies...
cd server
call npm install
cd ..

echo.
echo Installing client dependencies...
cd client
call npm install
cd ..

echo.
echo ================================
echo Installation Complete!
echo ================================
echo.
echo Next steps:
echo 1. Configure server environment: copy server\env.example to server\.env and edit
echo 2. Run setup.bat to generate password hashes
echo 3. Run start.bat to start the application
echo.
pause 