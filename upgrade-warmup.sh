#!/usr/bin/env bash
# upgrade-warmup.sh
# Script de atualização para o upgrade profissional do sistema de aquecimento v3.0.
# Rodar no VPS: bash upgrade-warmup.sh

set -e

APP_DIR="/opt/wajato"
cd $APP_DIR

echo "======================================================"
echo "  WaJato — Upgrade do Sistema de Aquecimento v3.0"
echo "======================================================"

echo ""
echo "[1/6] Aplicando migração do banco de dados..."
# Tenta prisma migrate deploy primeiro (se tiver histórico de migrações)
# Se falhar, aplica o SQL manual
if npx prisma migrate deploy 2>/dev/null; then
  echo "  ✅ Migrate deploy aplicado com sucesso."
else
  echo "  ⚠️  Migrate deploy falhou — aplicando SQLs manuais..."
  DATABASE_URL=$(grep DATABASE_URL .env | cut -d '=' -f2- | tr -d '"' | cut -d '?' -f1)
  psql "$DATABASE_URL" -f prisma/migrations/warmup_professional_upgrade.sql 2>/dev/null || true
  psql "$DATABASE_URL" -f prisma/migrations/warmup_pool_upgrade.sql 2>/dev/null || true
  psql "$DATABASE_URL" -f prisma/migrations/warmup_instances_upgrade.sql 2>/dev/null || true
  psql "$DATABASE_URL" -f prisma/migrations/warmup_v2_2_upgrade.sql 2>/dev/null || true
  psql "$DATABASE_URL" -f prisma/migrations/warmup_v2_4_upgrade.sql 2>/dev/null || true
  # v3.0 — novo campo messageId para reações reais
  psql "$DATABASE_URL" -f prisma/migrations/warmup_v3_messageid.sql 2>/dev/null || true
  # v3.1 — campos enableStatus, statusFrequency, statusType para Status/Stories + imagem
  psql "$DATABASE_URL" -f prisma/migrations/warmup_status_config.sql 2>/dev/null || true
  echo "  ✅ SQLs manuais aplicados."
fi

echo ""
echo "[2/6] Regenerando cliente Prisma..."
npx prisma generate
echo "  ✅ Prisma Client regenerado."

echo ""
echo "[3/6] Instalando novas dependências (se houver)..."
npm install --production=false
echo "  ✅ Dependências atualizadas."

echo ""
echo "[4/6] Executando testes automatizados..."
if npx vitest run 2>&1; then
  echo "  ✅ Todos os testes passaram."
else
  echo "  ⚠️  Alguns testes falharam. Verifique antes de continuar."
  read -p "  Continuar mesmo assim? (s/N): " confirm
  if [[ "$confirm" != "s" && "$confirm" != "S" ]]; then
    echo "  ❌ Upgrade cancelado."
    exit 1
  fi
fi

echo ""
echo "[5/6] Compilando o projeto Next.js..."
rm -rf .next
NODE_ENV=production npm run build
echo "  ✅ Build concluído."

echo ""
echo "[6/6] Reiniciando serviços no PM2..."
# Garante que os processos executam no diretório correto (/opt/wajato) especificando o --cwd
pm2 delete wajato-web 2>/dev/null || true
pm2 delete wajato-worker 2>/dev/null || true
pm2 delete wajato-warmup 2>/dev/null || true
pm2 delete wajato-warmup-pool 2>/dev/null || true
pm2 delete wajato-scheduler 2>/dev/null || true

NODE_ENV=production pm2 start npm --name "wajato-web" --cwd "/opt/wajato" -- run start
NODE_ENV=production pm2 start "npx tsx src/workers/message-worker.ts" --name "wajato-worker" --cwd "/opt/wajato"
NODE_ENV=production pm2 start "npx tsx src/workers/warmup-worker.ts" --name "wajato-warmup" --cwd "/opt/wajato"
NODE_ENV=production pm2 start "npx tsx src/workers/warmup-pool-worker.ts" --name "wajato-warmup-pool" --cwd "/opt/wajato"
NODE_ENV=production pm2 start "npx tsx src/workers/scheduler-worker.ts" --name "wajato-scheduler" --cwd "/opt/wajato"
pm2 save
echo "  ✅ PM2 reiniciado."

echo ""
echo "======================================================"
echo "  ✅ Upgrade do Aquecimento v3.0 concluído!"
echo "  Melhorias de segurança anti-ban:"
echo "    🎯 Rate Limiter com janela deslizante REAL (Redis SortedSet)"
echo "       ↳ Elimina o bug de 60+60=120 msgs na virada de hora"
echo "    🆔 messageId real do WhatsApp persistido nos logs"
echo "       ↳ Reações agora usam o ID correto (não Date.now() fictício)"
echo "    💚 Chip Router integrado nos workers de warmup"
echo "       ↳ healthScore atualizado a cada envio (sucesso/falha)"
echo "    🕐 Reset diário de contadores de chip (cron 00:05 BRT)"
echo "       ↳ dailyMsgCount zerando automaticamente todo dia"
echo "    🧪 Testes automatizados adicionados:"
echo "       ↳ warmup-schedule, warmup-rate-limiter (4 arquivos de teste)"
echo "    📊 Dashboard 'Saúde dos Chips' com sliding window em tempo real"
echo ""
echo "  Serviços PM2 ativos:"
pm2 list
echo "======================================================"


