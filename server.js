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

// Endpoint config pública (sin secretos)
app.get('/api/config/publica', (req, res) => {
  res.json({
    numeroWa: process.env.NUMERO_WA || '',
    nombreCabana: 'Cabaña Risaralda',
  });
});

// ── Inicialización ─────────────────────────────────────────────────────────────
db.init();
require('./src/scheduler').init();

const wa = require('./src/whatsapp');
const agent = require('./src/agent');

wa.init(async ({ from, text }) => {
  const respuesta = await agent.procesarMensaje(from, text);
  if (respuesta) await wa.sendMessage(from, respuesta);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🏡 Cabaña Risaralda — servidor en http://localhost:${PORT}`);
  console.log(`   Admin: http://localhost:${PORT}/admin.html`);
});
