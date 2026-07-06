#!/usr/bin/env bash
# deploy.sh - Script de deploy completo do WaJato na VPS

set -e

echo "======================================"
echo "  WaJato - Deploy na VPS"
echo "======================================"

APP_DIR="/opt/wajato"

echo "[1/6] Atualizando dependências do sistema..."
apt-get update -qq

echo "[2/6] Instalando PM2 globalmente..."
npm install -g pm2 2>/dev/null || true

echo "[3/6] Instalando dependências do projeto..."
cd $APP_DIR
npm install --production=false

echo "[4/6] Gerando cliente Prisma..."
npx prisma generate

echo "[5/6] Subindo containers Docker (PostgreSQL, Redis, Evolution API)..."
docker compose down --remove-orphans 2>/dev/null || true
docker compose up -d --wait

echo "[6/6] Aguardando banco de dados ficar pronto..."
sleep 10

echo "[7/7] Rodando migrações e seed do banco de dados..."
DATABASE_URL=$(grep DATABASE_URL .env | cut -d '=' -f2-) npx prisma migrate deploy 2>/dev/null || npx prisma db push --accept-data-loss
npx prisma db seed

echo "--------------------------------------"
echo " Compilando o projeto Next.js..."
NODE_ENV=production npm run build

echo "--------------------------------------"
echo " Iniciando/Reiniciando serviços no PM2..."
pm2 delete wajato-web 2>/dev/null || true
pm2 delete wajato-worker 2>/dev/null || true

# Carrega variáveis do .env e inicia com NODE_ENV=production
export $(grep -v '^#' .env | xargs)
NODE_ENV=production pm2 start npm --name "wajato-web" -- run start
NODE_ENV=production pm2 start "npx tsx src/workers/message-worker.ts" --name "wajato-worker"
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo ""
echo "======================================"
echo "  Deploy concluido com sucesso!"
echo "  Acesse: https://wajato.ftech-apps.com.br"
echo "  Painel Evolution API: https://evo-wajato.ftech-apps.com.br"
echo "======================================"
pm2 list
