@echo off
chcp 65001 >nul
echo Parando servicos WaJato...
call npx pm2 stop all
docker compose stop
echo Servicos parados com sucesso.
pause
