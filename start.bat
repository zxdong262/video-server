@echo off
rem Keep the working directory at the repo root so .env is picked up.
cd /d %~dp0
node server.js >> server.log 2>&1
