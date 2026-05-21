#!/usr/bin/env bash
# Simula un mensaje entrante de Whapi contra el servidor local.
# Uso: ./scripts/test-webhook.sh [numero_remitente] [texto]
# Ejemplo: ./scripts/test-webhook.sh 573225364311 "Hola, quiero precios"

FROM="${1:-573225364311}"
TEXT="${2:-Hola, quiero saber precios}"
PORT="${PORT:-3000}"

echo "→ POST http://localhost:${PORT}/webhook"
echo "  from: ${FROM}"
echo "  text: ${TEXT}"
echo ""

curl -s -X POST "http://localhost:${PORT}/webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"messages\": [{
      \"id\": \"test-$(date +%s)\",
      \"from_me\": false,
      \"type\": \"text\",
      \"chat_id\": \"${FROM}@s.whatsapp.net\",
      \"text\": { \"body\": \"${TEXT}\" },
      \"from\": \"${FROM}\"
    }],
    \"event\": { \"type\": \"messages\", \"event\": \"post\" }
  }"

echo ""
echo ""
echo "Revisa la consola donde corre 'npm start' (logs 📩 / ✅ / ❌)."
