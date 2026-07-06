#!/usr/bin/env bash
# upgrade-warmup.sh
# Script de atualização específico para o upgrade profissional do sistema de aquecimento.
# Rodar no VPS: bash upgrade-warmup.sh

set -e

APP_DIR="/opt/wajato"
cd $APP_DIR

echo "======================================================"
echo "  WaJato — Upgrade do Sistema de Aquecimento v2.0"
echo "======================================================"

echo ""
echo "[1/5] Aplicando migração do banco de dados..."
# Tenta prisma migrate deploy primeiro (se tiver histórico de migrações)
# Se falhar, aplica o SQL manual
if npx prisma migrate deploy 2>/dev/null; then
  echo "  ✅ Migrate deploy aplicado com sucesso."
else
  echo "  ⚠️  Migrate deploy falhou — aplicando SQL manual..."
  DATABASE_URL=$(grep DATABASE_URL .env | cut -d '=' -f2- | tr -d '"' | cut -d '?' -f1)
  psql "$DATABASE_URL" -f prisma/migrations/warmup_professional_upgrade.sql
  psql "$DATABASE_URL" -f prisma/migrations/warmup_pool_upgrade.sql
  echo "  ✅ SQLs manuais aplicados."
fi

echo ""
echo "[2/5] Regenerando cliente Prisma..."
npx prisma generate
echo "  ✅ Prisma Client regenerado."

echo ""
echo "[3/5] Instalando novas dependências (se houver)..."
npm install --production=false
echo "  ✅ Dependências atualizadas."

echo ""
echo "[4/5] Compilando o projeto Next.js..."
NODE_ENV=production npm run build
echo "  ✅ Build concluído."

echo ""
echo "[5/5] Reiniciando serviços no PM2..."
pm2 restart wajato-web --update-env 2>/dev/null || pm2 start npm --name "wajato-web" -- run start
pm2 restart wajato-worker --update-env 2>/dev/null || NODE_ENV=production pm2 start "npx tsx src/workers/message-worker.ts" --name "wajato-worker"
pm2 save
echo "  ✅ PM2 reiniciado."

echo ""
echo "======================================================"
echo "  ✅ Upgrade do Aquecimento v2.0 concluído!"
echo "  Novidades:"
echo "    🕐 Janela de horário comercial (8h-22h BRT)"
echo "    📊 Jitter gaussiano (Box-Muller)"
echo "    🎭 Mix de tipos: texto + emoji + sticker + reação"
echo "    ⏸️  Rest periods automáticos"
echo "    🔥 Heat Score visual"
echo "    📈 Ramp-up progressivo (5→150 msgs/dia)"
echo "    🎛️  Pausa/Retomada de campanhas"
echo "======================================================"
pm2 list
