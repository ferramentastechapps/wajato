#!/bin/bash
echo "=== Docs/OpenAPI ==="
curl -s "http://localhost:8080/docs" | head -200
echo ""
echo "=== OpenAPI JSON ==="
curl -s "http://localhost:8080/api-json" | head -500
echo ""
echo "=== Testando /instance/requestPairingCode/bernardo ==="
curl -s -X POST -H "apikey: wajato_global_api_key_5544" -H "Content-Type: application/json" \
  -d '{"number":"5516982101357"}' \
  "http://localhost:8080/instance/requestPairingCode/bernardo"
echo ""
echo "=== Testando formato alternativo connect ==="
curl -s -X GET -H "apikey: wajato_global_api_key_5544" \
  "http://localhost:8080/instance/connect/bernardo?pairingCode=true&number=5516982101357"
echo ""
