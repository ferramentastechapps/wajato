#!/bin/bash
# Testa pairing code - deletando e recriando do zero sem QR code
echo "=== 1. Deletando bernardo ==="
curl -s -X DELETE \
  -H "apikey: wajato_global_api_key_5544" \
  "http://localhost:8080/instance/delete/bernardo"
echo ""
sleep 2

echo "=== 2. Recriando SEM qrcode ==="
printf '{"instanceName":"bernardo","qrcode":false,"integration":"WHATSAPP-BAILEYS"}' > /tmp/b2.json
curl -s -X POST \
  -H "apikey: wajato_global_api_key_5544" \
  -H "Content-Type: application/json" \
  -d @/tmp/b2.json \
  "http://localhost:8080/instance/create"
echo ""
sleep 2

echo "=== 3. Estado da instancia ==="
curl -s -H "apikey: wajato_global_api_key_5544" \
  "http://localhost:8080/instance/connectionState/bernardo"
echo ""
sleep 1

echo "=== 4. Pedindo pairing code IMEDIATAMENTE ==="
curl -s -H "apikey: wajato_global_api_key_5544" \
  "http://localhost:8080/instance/connect/bernardo?number=5516982101357"
echo ""
