@echo off
cd /d "%~dp0"
start "" http://atlas.localhost:8080
npx -y serve -l 8080
