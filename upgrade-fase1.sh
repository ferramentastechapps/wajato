#!/usr/bin/env bash
# upgrade-fase1.sh
# Script de atualização para as melhorias da Fase 1:
# - Segurança & Auth (Roles, Zod, Rate Limiting)
# - Rotação Inteligente de Chips
# - Analytics com Gráficos (SVG + Chip Health)
#
# Rodar no servidor: bash upgrade-fase1.sh

set -e

APP_DIR="/opt/wajato"
cd $APP_DIR

echo "======================================================="
echo "  WaJato — Upgrade Fase 1: Segurança + Chip Router"
echo "======================================================="

echo ""
echo "[1/5] Atualizando código do projeto (git pull)..."
git pull origin master
echo "  ✅ Código atualizado."

echo ""
echo "[2/5] Instalando novas dependências (zod)..."
npm install --production=false
echo "  ✅ Dependências atualizadas."

echo ""
echo "[3/5] Aplicando migração SQL no banco de dados..."
# Tenta prisma migrate deploy primeiro (para ambiente com migrações rastreadas)
if npx prisma migrate deploy 2>/dev/null; then
  echo "  ✅ Migrate deploy aplicado com sucesso."
else
  echo "  ⚠️  Migrate deploy falhou — aplicando SQL manual..."
  DATABASE_URL=$(grep DATABASE_URL .env | cut -d '=' -f2- | tr -d '"')
  docker compose exec -T wajato-db psql -U wajato -d wajato_db \
    -f /opt/wajato/prisma/migrations/fase1_security_chip_router.sql
  echo "  ✅ SQL manual aplicado."
fi

echo ""
echo "[4/5] Regenerando cliente Prisma e compilando o projeto..."
npx prisma generate
NODE_ENV=production npm run build
echo "  ✅ Build concluído."

echo ""
echo "[5/5] Reiniciando serviços no PM2..."
pm2 restart wajato-web   --update-env 2>/dev/null || NODE_ENV=production pm2 start npm --name "wajato-web" -- run start
pm2 restart wajato-worker --update-env 2>/dev/null || NODE_ENV=production pm2 start "npx tsx src/workers/message-worker.ts" --name "wajato-worker"
pm2 save
echo "  ✅ PM2 reiniciado."

echo ""
echo "======================================================="
echo "  ✅ Upgrade Fase 1 concluído com sucesso!"
echo ""
echo "  Novidades desta versão:"
echo "    🔒 Roles de usuário (Admin / Operator / Viewer)"
echo "    ✅ Validação de payload com Zod em todos os endpoints"
echo "    🛡️  Rate limiting no login (5 tentativas/min por IP)"
echo "    🔄 Rotação inteligente de chips com Health Score"
echo "    📊 Dashboard de métricas com gráfico de 7 dias + Chip Health"
echo "======================================================="
pm2 list
