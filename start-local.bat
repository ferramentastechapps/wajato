@echo off
chcp 65001 >nul
echo ======================================================
echo   WaJato - Inicializando Sistema Local (Modo VPS)
echo ======================================================
echo.

if not exist .env (
    echo [!] Arquivo .env não encontrado. Copiando de .env.example...
    copy .env.example .env
    echo [!] Configure o arquivo .env com suas chaves antes de continuar.
    pause
    exit /b 1
)

echo [1/5] Subindo containers Docker (Postgres, Redis, Evolution Go)...
docker compose up -d
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao subir containers. Verifique se o Docker Desktop está aberto.
    pause
    exit /b 1
)

echo.
echo [2/5] Instalando dependências Node...
call npm install

echo.
echo [3/5] Sincronizando banco de dados com Prisma...
call npx prisma db push
call npx prisma generate

echo.
echo [4/5] Compilando aplicação Next.js...
call npm run build

echo.
echo [5/5] Iniciando processos via PM2...
call npx pm2 delete all 2>nul
call npx pm2 start ecosystem.config.js
call npx pm2 save

echo.
echo ======================================================
echo   ✅ Sistema WaJato está rodando localmente!
echo   Painel Web: http://localhost:3000
echo   Evolution API: http://localhost:8080
echo ======================================================
call npx pm2 list
pause
