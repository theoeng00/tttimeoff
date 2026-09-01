@echo off
echo ==========================================
echo   TimeOff Management - Starting...
echo ==========================================
echo.

REM Apply a restore while SQLite is not open, before running migrations
echo [1/3] Applying pending database restore...
node bin\apply_pending_restore.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Database restore failed! The server was not started.
    pause
    exit /b 1
)
echo      Done!
echo.

REM Run database migrations
echo [2/3] Running database migrations...
npx sequelize db:migrate --config=config/db.json --models-path=lib/model/db/
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Database migration failed!
    pause
    exit /b 1
)
echo      Done!
echo.

REM Compile SASS
echo [3/3] Compiling SASS...
npx sass scss/main.scss public/css/style.css
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo WARNING: SASS compilation failed, but continuing...
)
echo      Done!
echo.

echo ==========================================
echo   Starting server on http://localhost:3000
echo   Press Ctrl+C to stop
echo ==========================================
echo.
node bin/wwww
