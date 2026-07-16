#!/bin/bash
echo "=== Evolution API - testando endpoint de pairing code alternativo ==="
echo ""
echo "--- 1. POST /instance/pairingCode/bernardo ---"
curl -sv -X POST -H "apikey: wajato_global_api_key_5544" -H "Content-Type: application/json" \
  --data-raw '{"number":"5516982101357"}' \
  "http://localhost:8080/instance/pairingCode/bernardo" 2>&1 | tail -5
echo ""

echo "--- 2. GET /instance/pairingCode/bernardo ---"
curl -s -H "apikey: wajato_global_api_key_5544" \
  "http://localhost:8080/instance/pairingCode/bernardo?number=5516982101357" 
echo ""

echo "--- 3. Verificar fonte do container ---"
docker exec wajato-evolution ls /evolution/dist/ 2>/dev/null | head -10
echo ""

echo "--- 4. Verificar versão exata ---"
docker exec wajato-evolution cat /evolution/package.json 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print('version:', d.get('version'), 'name:', d.get('name'))"
echo ""

echo "--- 5. Buscar 'pairingCode' no código da Evolution API ---"
docker exec wajato-evolution grep -r "pairingCode" /evolution/dist/main.js 2>/dev/null | head -3
echo ""
