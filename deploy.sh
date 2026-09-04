#!/usr/bin/env bash
# deploy.sh
# Script de deploy automatizado via Git no servidor VPS.

set -e

APP_DIR="/opt/wajato"
cd $APP_DIR

echo "======================================================"
echo "  WaJato — Deploy Automatizado"
echo "======================================================"

echo ""
echo "[1/6] Sincronizando com o repositório Git (GitHub)..."
# Descarta alterações locais no VPS para evitar conflitos de merge
git reset --hard
git clean -fd
git pull origin master

echo ""
echo "[2/6] Aplicando sincronização do banco de dados (Prisma db push)..."
npx prisma db push --skip-generate || true
DATABASE_URL=$(grep DATABASE_URL .env | cut -d '=' -f2- | tr -d '"' | cut -d '?' -f1)
psql "$DATABASE_URL" -f prisma/migrations/warmup_stages_and_dynamic_limit.sql 2>/dev/null || true

echo ""
echo "[3/6] Regenerando cliente Prisma..."
npx prisma generate

echo ""
echo "[4/6] Instalando dependências..."
npm install --production=false

echo ""
echo "[5/6] Compilando o Next.js (limpando cache)..."
pm2 stop wajato-web 2>/dev/null || true
rm -rf .next
NODE_ENV=production npm run build

echo ""
echo "[6/6] Reiniciando os processos no PM2..."
pm2 restart wajato-web wajato-warmup wajato-warmup-pool wajato-scheduler wajato-worker --update-env
pm2 save

echo ""
echo "======================================================"
echo "  ✅ Deploy concluído com sucesso e serviços online!"
echo "======================================================"
