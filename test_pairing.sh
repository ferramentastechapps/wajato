#!/bin/bash
# Testa pairing code na Evolution API v2
echo "=== Testando GET /instance/connect/bernardo?number=5516982101357 ==="
curl -s -X GET \
  -H "apikey: wajato_global_api_key_5544" \
  "http://localhost:8080/instance/connect/bernardo?number=5516982101357"
echo ""
echo ""
echo "=== Testando POST /instance/pairingCode/bernardo ==="
printf '{"number":"5516982101357"}' > /tmp/pair.json
curl -s -X POST \
  -H "apikey: wajato_global_api_key_5544" \
  -H "Content-Type: application/json" \
  -d @/tmp/pair.json \
  "http://localhost:8080/instance/pairingCode/bernardo"
echo ""
