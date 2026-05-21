const cron = require('node-cron');
const moment = require('moment-timezone');
const db = require('./database');
const wa = require('./whatsapp');

const TZ = 'America/Bogota';

function init() {
  // Corre a las 9 AM hora Bogotá, una vez al día
  cron.schedule('0 9 * * *', async () => {
    const ahora = moment().tz(TZ);
    const manana = ahora.clone().add(1, 'day').format('YYYY-MM-DD');
    const ayer = ahora.clone().subtract(1, 'day').format('YYYY-MM-DD');

    try {
      // 1. Recordatorio check-in (24h antes)
      const checkins = db.getReservasParaRecordatorioCheckin(manana);
      for (const r of checkins) {
        const msg = `¡Hola ${r.nombre}! 🏡 Te esperamos mañana en Refugio del Viento.\nCheck-in: 3:00 PM\n📍 Risaralda, Caldas — te compartimos el acceso exacto al confirmar tu llegada.\n¿Alguna duda antes de venir? ☕`;
        if (r.wa_number) {
          await wa.sendMessage(r.wa_number, msg);
        }
        db.actualizarReserva(r.id, { recordatorio_checkin_enviado: 1 });
        console.log(`Recordatorio check-in enviado a ${r.nombre} (reserva #${r.id})`);
      }

      // 2. Recordatorio reseña (24h después del checkout)
      const resenas = db.getReservasParaRecordatorioResena(ayer);
      for (const r of resenas) {
        const msg = `¡Hola ${r.nombre}! Esperamos que hayas disfrutado tu estadía en Refugio del Viento 🌿\nNos encantaría que nos dejaras una reseña en Google Maps, ¡nos ayuda mucho!\n👉 https://g.page/r/cabana-risaralda/review\n¡Hasta pronto! ☕🏡`;
        if (r.wa_number) {
          await wa.sendMessage(r.wa_number, msg);
        }
        db.actualizarReserva(r.id, { recordatorio_resena_enviado: 1 });
        console.log(`Recordatorio reseña enviado a ${r.nombre} (reserva #${r.id})`);
      }

      // 3. Limpiar conversaciones inactivas (+48h)
      db.getDb().prepare(`
        DELETE FROM conversaciones WHERE ultimo_mensaje < datetime('now', '-48 hours')
      `).run();

      // 4. Marcar como completadas las reservas con checkout ayer
      db.getDb().prepare(`
        UPDATE reservas SET estado = 'completada'
        WHERE fecha_salida = ? AND estado = 'confirmada'
      `).run(ayer);

    } catch (err) {
      console.error('Error en scheduler:', err.message);
    }
  });

  console.log('Scheduler de recordatorios iniciado (corre a las 9 AM Bogotá)');
}

module.exports = { init };
