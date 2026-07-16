#!/bin/bash
# Reseta o status do bernardo no banco para DISCONNECTED
docker exec wajato-db psql -U wajato -d wajato_db -c "UPDATE \"WhatsAppInstance\" SET status='DISCONNECTED', \"qrCode\"=NULL WHERE name='bernardo';"
echo "Status resetado. Verifique:"
docker exec wajato-db psql -U wajato -d wajato_db -c "SELECT name, status, phone, \"qrCode\" FROM \"WhatsAppInstance\" WHERE name='bernardo';"
