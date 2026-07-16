#!/bin/bash
# Recria a instância Bernardo limpa para conectar via pairing code
printf '{"instanceName":"bernardo","qrcode":false,"integration":"WHATSAPP-BAILEYS"}' > /tmp/b.json
curl -s -X POST \
  -H "apikey: wajato_global_api_key_5544" \
  -H "Content-Type: application/json" \
  -d @/tmp/b.json \
  http://localhost:8080/instance/create
echo ""
echo "Instancia bernardo recriada. Agora configure o webhook:"
curl -s -X POST \
  -H "apikey: wajato_global_api_key_5544" \
  -H "Content-Type: application/json" \
  --data-raw '{"webhook":{"enabled":true,"url":"https://wajato.ftech-apps.com.br/api/webhook","events":["CONNECTION_UPDATE","MESSAGES_UPSERT","MESSAGES_UPDATE"]}}' \
  http://localhost:8080/webhook/set/bernardo
echo ""
echo "PRONTO. Agora gere o pairing code no app."
