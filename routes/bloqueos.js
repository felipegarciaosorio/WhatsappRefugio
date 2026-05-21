const express = require('express');
const router = express.Router();
const db = require('../src/database');
const { isValidDate, diasEnRango } = require('../src/utils');
const { requireAuth } = require('./admin');

// GET /api/bloqueos
router.get('/', (req, res) => {
  res.json(db.getBloqueos());
});

// POST /api/bloqueos — bloquear un día
router.post('/', requireAuth, (req, res) => {
  const { fecha, motivo, descripcion } = req.body;
  if (!fecha || !motivo) return res.status(400).json({ error: 'Se requieren fecha y motivo' });
  if (!isValidDate(fecha)) return res.status(400).json({ error: 'Fecha inválida' });

  const result = db.crearBloqueo({ fecha, motivo, descripcion });
  res.status(201).json({ ok: true, fecha });
});

// POST /api/bloqueos/rango — bloquear un rango de días
router.post('/rango', requireAuth, (req, res) => {
  const { fechaInicio, fechaFin, motivo, descripcion } = req.body;
  if (!fechaInicio || !fechaFin || !motivo) {
    return res.status(400).json({ error: 'Se requieren fechaInicio, fechaFin y motivo' });
  }
  if (!isValidDate(fechaInicio) || !isValidDate(fechaFin)) {
    return res.status(400).json({ error: 'Fechas inválidas' });
  }
  if (fechaInicio > fechaFin) {
    return res.status(400).json({ error: 'fechaInicio debe ser anterior o igual a fechaFin' });
  }

  const dias = diasEnRango(fechaInicio, fechaFin);
  for (const dia of dias) {
    db.crearBloqueo({ fecha: dia, motivo, descripcion });
  }
  res.status(201).json({ ok: true, diasBloqueados: dias.length, dias });
});

// DELETE /api/bloqueos/rango — desbloquear rango (body: { fechaInicio, fechaFin })
// IMPORTANTE: debe estar ANTES de /:fecha o Express lo captura como fecha='rango'
router.delete('/rango', requireAuth, (req, res) => {
  const { fechaInicio, fechaFin } = req.body;
  if (!fechaInicio || !fechaFin) {
    return res.status(400).json({ error: 'Se requieren fechaInicio y fechaFin' });
  }
  const dias = diasEnRango(fechaInicio, fechaFin);
  for (const dia of dias) db.eliminarBloqueo(dia);
  res.json({ ok: true, diasDesbloqueados: dias.length });
});

// DELETE /api/bloqueos/:fecha — desbloquear un día
router.delete('/:fecha', requireAuth, (req, res) => {
  const { fecha } = req.params;
  if (!isValidDate(fecha)) return res.status(400).json({ error: 'Fecha inválida' });
  db.eliminarBloqueo(fecha);
  res.json({ ok: true, fecha });
});

module.exports = router;
