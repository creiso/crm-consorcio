@echo off
rem Mantem o conector no ar: se ele cair, volta sozinho em 10 segundos.
cd /d "%~dp0"
:de_novo
rem o proprio conector escreve o conector.log
node index.mjs >nul 2>&1
rem codigo 3 = ja existe um conector ligado neste PC
if %errorlevel%==3 exit /b 0
ping -n 11 127.0.0.1 >nul
goto de_novo
