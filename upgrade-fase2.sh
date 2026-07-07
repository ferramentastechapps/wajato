#!/usr/bin/env bash
# upgrade-fase2.sh
# Script de atualização para as melhorias da Fase 2:
# - Chatbot / Auto-Responder com IA Gemini
# - Segmentações Dinâmicas de Contatos
# - CRM Kanban (Funil Comercial)
# - Agendamento de Campanhas
#
# Rodar no servidor: bash upgrade-fase2.sh

set -e

APP_DIR="/opt/wajato"
cd $APP_DIR

echo "======================================================="
echo "  WaJato — Upgrade Fase 2: Chatbot + CRM + Segments"
echo "======================================================="

echo ""
echo "[1/5] Atualizando código do projeto (unzip)..."
unzip -o deploy.zip
echo "  ✅ Código atualizado."

echo ""
echo "[2/5] Instalando dependências..."
npm install --production=false
echo "  ✅ Dependências instaladas."

echo ""
echo "[3/5] Aplicando migrações SQL no banco de dados..."
# Tenta prisma migrate deploy primeiro (para ambiente com migrações rastreadas)
if npx prisma migrate deploy 2>/dev/null; then
  echo "  ✅ Migrate deploy aplicado com sucesso."
else
  echo "  ⚠️  Migrate deploy falhou — aplicando SQL manual..."
  DATABASE_URL=$(grep DATABASE_URL .env | cut -d '=' -f2- | tr -d '"' | cut -d '?' -f1)
  
  if command -v psql &>/dev/null; then
    psql "$DATABASE_URL" -f prisma/migrations/fase2_chatbot_autoresponder.sql
    psql "$DATABASE_URL" -f prisma/migrations/fase2_segments.sql
    psql "$DATABASE_URL" -f prisma/migrations/fase2_crm.sql
  else
    docker compose exec -T wajato-db psql -U wajato -d wajato_db < prisma/migrations/fase2_chatbot_autoresponder.sql
    docker compose exec -T wajato-db psql -U wajato -d wajato_db < prisma/migrations/fase2_segments.sql
    docker compose exec -T wajato-db psql -U wajato -d wajato_db < prisma/migrations/fase2_crm.sql
  fi
  echo "  ✅ SQLs manuais aplicados."
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
echo "  ✅ Upgrade Fase 2 concluído com sucesso!"
echo ""
echo "  Novidades desta versão:"
echo "    🤖 Chatbot Auto-Responder (IA Gemini + Regras de Palavra-chave)"
echo "    ⏰ Agendamento automático de campanhas"
echo "    🎯 Segmentações avançadas de contatos"
echo "    📋 CRM Kanban (Organização comercial estilo arrasta-e-solta)"
echo "======================================================="
pm2 list
