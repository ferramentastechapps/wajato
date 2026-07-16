#!/bin/bash
# Força logout + reconexão limpa do bernardo e pega pairing code
echo "=== 1. Logout do bernardo ==="
curl -s -X DELETE \
  -H "apikey: wajato_global_api_key_5544" \
  "http://localhost:8080/instance/logout/bernardo"
echo ""
sleep 2

echo "=== 2. Verificando estado após logout ==="
curl -s -H "apikey: wajato_global_api_key_5544" \
  "http://localhost:8080/instance/connectionState/bernardo"
echo ""
sleep 2

echo "=== 3. Pedindo pairing code ==="
curl -s -X GET \
  -H "apikey: wajato_global_api_key_5544" \
  "http://localhost:8080/instance/connect/bernardo?number=5516982101357"
echo ""
