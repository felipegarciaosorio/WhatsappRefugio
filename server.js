require('dotenv').config();
process.env.TZ = process.env.TZ || 'America/Bogota';

const express = require('express');
const path = require('path');
const db = require('./src/database');

const app = express();

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Rutas API ──────────────────────────────────────────────────────────────────
app.use('/api/disponibilidad', require('./routes/disponibilidad'));
app.use('/api/reservas', require('./routes/reservas'));
app.use('/api/bloqueos', require('./routes/bloqueos'));
app.use('/api/admin', require('./routes/admin'));

const webhookRouter = require('./routes/webhook');
app.use('/webhook', webhookRouter);

// Endpoint config pública (sin secretos)
app.get('/api/config/publica', (req, res) => {
  res.json({
    numeroWa: process.env.NUMERO_WA || '',
    nombreCabana: 'Refugio del Viento',
  });
});

// ── Inicialización ─────────────────────────────────────────────────────────────
db.init();
require('./src/scheduler').init();

const wa = require('./src/whatsapp');
const agent = require('./src/agent');

// Conectar agente al webhook de Whapi.cloud
const { setHandlers } = require('./routes/webhook');
setHandlers(
  (from, text) => agent.procesarMensaje(from, text),
  (to, text) => wa.sendMessageWhapi(to, text),
);

if (process.env.WHAPI_TOKEN) {
  console.log('📲 Modo Whapi.cloud activo — esperando webhooks en POST /webhook');
  console.log('   ⚠️  Whapi NO puede llamar a localhost. Usa ngrok o deploy (ver README).');
  wa.checkWhapiHealth().then(async (h) => {
    if (h.ok) {
      console.log(`   ✅ Whapi: conectado (${h.waId || 'WA'}) canal ${h.channelId || ''}`);
    } else {
      console.error('   ❌ Whapi:', h.error || h.channelStatus || h.detail || h.status);
      console.error('      → Verifica WHAPI_TOKEN en .env y reinicia npm start');
      return;
    }
    const webhookOk = await wa.checkWhapiWebhook();
    if (!webhookOk.ok) {
      console.warn('   ⚠️  Webhook Whapi:', webhookOk.mensaje);
      console.warn('      → En panel.whapi.cloud pon la URL con /webhook al final');
    }
  });
} else {
  // Baileys (fallback local sin WHAPI_TOKEN) — levanta QR en consola
  wa.init(async ({ from, text }) => {
    const respuesta = await agent.procesarMensaje(from, text);
    if (respuesta) await wa.sendMessage(from, respuesta);
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🏡 Refugio del Viento — servidor en http://localhost:${PORT}`);
  console.log(`   Admin: http://localhost:${PORT}/admin.html`);
});
