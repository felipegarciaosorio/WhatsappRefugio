const express = require('express');
const router = express.Router();

let agentHandler = null;
let waSender = null;

function setHandlers(agent, wa) {
  agentHandler = agent;
  waSender = wa;
}

// POST /webhook — recibe mensajes de Whapi.cloud
router.post('/', async (req, res) => {
  res.sendStatus(200); // responder rápido para que Whapi no reintente

  const body = req.body || {};
  const messages = body.messages || [];
  const eventType = body.event?.type || body.event?.event || 'desconocido';

  if (!messages.length) {
    console.log(`📩 Webhook recibido (evento: ${eventType}, sin mensajes de texto)`);
    return;
  }

  for (const msg of messages) {
    try {
      if (msg.from_me) continue;

      const text = msg.text?.body || msg.body || '';
      if (!text) {
        console.log(`📩 Mensaje ignorado (tipo: ${msg.type || 'sin tipo'}, sin texto)`);
        continue;
      }

      const from = (msg.from || msg.chat_id || '').replace('@s.whatsapp.net', '').replace(/\D/g, '');
      if (!from) continue;

      console.log(`📩 WA entrante de ${from}: "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`);

      if (!agentHandler) {
        console.warn('⚠️  Agente no configurado (setHandlers no llamado)');
        continue;
      }

      const respuesta = await agentHandler(from, text);
      if (!respuesta) {
        console.warn(`⚠️  Agente no devolvió respuesta para ${from}`);
        continue;
      }

      if (waSender) {
        await waSender(from, respuesta);
        console.log(`✅ WA saliente a ${from}: "${respuesta.slice(0, 60)}${respuesta.length > 60 ? '…' : ''}"`);
      }
    } catch (err) {
      console.error('❌ Error procesando webhook message:', err.message);
    }
  }
});

// GET /webhook — verificación manual (Whapi usa POST; útil para probar que la URL responde)
router.get('/', (req, res) => {
  res.json({ ok: true, mensaje: 'Webhook activo. Whapi debe enviar POST aquí con mensajes entrantes.' });
});

module.exports = router;
module.exports.setHandlers = setHandlers;
